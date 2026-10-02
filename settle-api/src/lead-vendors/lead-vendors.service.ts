import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../entities/lead.entity';
import { LeadVendorAccount } from '../entities/lead-vendor-account.entity';
import {
  LeadImportBatch,
  LeadImportBatchSource,
  LeadImportBatchStatus,
} from '../entities/lead-import-batch.entity';
import {
  LeadPurchase,
  LeadPurchaseStatus,
} from '../entities/lead-purchase.entity';
import { CollectionAccountStatus } from '../entities/collection-account.entity';
import { CollectionNoteType } from '../entities/collection-note.entity';
import { CrmService } from '../crm/crm.service';
import { CollectionsService } from '../collections/collections.service';
import { LeadVendorRegistry } from './vendor-registry.service';
import { VendorLeadScoringService } from './vendor-lead-scoring.service';
import {
  LeadCriteria,
  LeadVendorNotConfiguredError,
  LeadVendorUpstreamError,
  PingResult,
} from './lead-vendor-provider.interface';
import {
  NormalizedLead,
  csvRowToRecord,
  normalizeVendorLead,
  parseCsv,
} from './lead-normalizer';
import { PurchaseLeadsDto } from './dto/purchase-leads.dto';
import { ListImportedLeadsDto } from './dto/list-imported-leads.dto';
import { UpsertVendorAccountDto } from './dto/upsert-vendor-account.dto';

export interface ImportResult {
  batch: LeadImportBatch;
  leadIds: string[];
}

@Injectable()
export class LeadVendorsService {
  private readonly logger = new Logger(LeadVendorsService.name);

  constructor(
    private readonly registry: LeadVendorRegistry,
    private readonly scoring: VendorLeadScoringService,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(LeadImportBatch)
    private readonly batchesRepository: Repository<LeadImportBatch>,
    @InjectRepository(LeadPurchase)
    private readonly purchasesRepository: Repository<LeadPurchase>,
    @InjectRepository(LeadVendorAccount)
    private readonly accountsRepository: Repository<LeadVendorAccount>,
    private readonly crmService: CrmService,
    private readonly collectionsService: CollectionsService,
  ) {}

  // ── Vendor status / accounts ─────────────────────────────────────────

  listVendors() {
    return this.registry.listVendors();
  }

  async getVendor(name: string) {
    const provider = await this.registry.getProvider(name);
    const status = await provider.status();
    return { ...status, active: await this.registry.isActive(name) };
  }

  async listAccounts() {
    return this.accountsRepository.find({ order: { vendorName: 'ASC' } });
  }

  async upsertAccount(dto: UpsertVendorAccountDto) {
    const vendorName = dto.vendorName.toLowerCase();
    let account = await this.accountsRepository.findOne({ where: { vendorName } });
    if (account) {
      account = this.accountsRepository.merge(account, { ...dto, vendorName });
    } else {
      account = this.accountsRepository.create({ ...dto, vendorName });
    }
    const saved = await this.accountsRepository.save(account);
    this.registry.refresh();
    return saved;
  }

  // ── Pricing / purchase ───────────────────────────────────────────────

  private async assertUsableVendor(name: string) {
    const provider = await this.registry.getProvider(name); // 404 on unknown
    if (!(await this.registry.isActive(name))) {
      throw new BadRequestException(`Lead vendor "${name}" is disabled`);
    }
    if (!provider.isConfigured()) {
      // Fail closed with 503 — mirrors the credit-bureau pattern.
      throw new ServiceUnavailableException(
        new LeadVendorNotConfiguredError(name).message,
      );
    }
    return provider;
  }

  /** Quote a per-lead price for criteria — a ping without a person. */
  async priceLead(vendor: string, criteria: LeadCriteria): Promise<PingResult> {
    const provider = await this.assertUsableVendor(vendor);
    try {
      return await provider.priceLead(criteria);
    } catch (err) {
      throw this.translateVendorError(err);
    }
  }

  /**
   * Buy `dto.quantity` leads from a vendor. When the vendor supports ping
   * pricing and a `maxPricePerLead` cap was given, we ping first and refuse
   * bids above the cap before any money moves.
   */
  async purchaseLeads(dto: PurchaseLeadsDto, userId: string) {
    const provider = await this.assertUsableVendor(dto.vendor);
    const criteria: LeadCriteria = {
      states: dto.states,
      debtTypes: dto.debtTypes,
      minDebt: dto.minDebt,
      maxDebt: dto.maxDebt,
      maxPricePerLead: dto.maxPricePerLead,
    };

    const purchase = await this.purchasesRepository.save(
      this.purchasesRepository.create({
        vendorName: dto.vendor.toLowerCase(),
        criteria,
        quantityRequested: dto.quantity,
        status: LeadPurchaseStatus.PENDING,
        createdBy: userId,
      }),
    );

    try {
      // Optional price check — ping first when the vendor supports it.
      if (provider.supportsPingPost || dto.maxPricePerLead !== undefined) {
        try {
          const ping = await provider.priceLead(criteria);
          purchase.vendorPingId = ping.pingId;
          if (ping.price !== undefined) purchase.pricePerLead = ping.price;
          if (
            dto.maxPricePerLead !== undefined &&
            ping.price !== undefined &&
            ping.price > dto.maxPricePerLead
          ) {
            purchase.status = LeadPurchaseStatus.REJECTED;
            purchase.error = `Vendor price ${ping.price} exceeds cap ${dto.maxPricePerLead}`;
            await this.purchasesRepository.save(purchase);
            throw new BadRequestException(purchase.error);
          }
          if (ping.pingId) purchase.status = LeadPurchaseStatus.PINGED;
        } catch (err) {
          // A failed ping only blocks when it's a hard cap rejection or an
          // HTTP error — transient ping errors shouldn't stop an order.
          if (err instanceof HttpException || err instanceof LeadVendorNotConfiguredError) {
            throw err;
          }
          this.logger.warn(`Ping before purchase failed for ${dto.vendor}: ${err}`);
        }
      }

      const result = await provider.purchaseLeads(criteria, dto.quantity);
      purchase.vendorPostId = result.purchaseId;
      purchase.pricePerLead = result.pricePerLead ?? purchase.pricePerLead;
      purchase.totalCost = result.totalCost;
      purchase.quantityReceived = result.quantityReceived;
      purchase.rawResponse = (result.raw as Record<string, any>) ?? undefined;

      if (result.leads.length) {
        const { batch } = await this.importRecords(dto.vendor, result.leads, {
          source: LeadImportBatchSource.API_ORDER,
          filename: result.purchaseId,
          costPerLead: result.pricePerLead,
          createdBy: userId,
        });
        purchase.importBatchId = batch.id;
        purchase.quantityReceived = batch.imported;
        purchase.totalCost =
          result.totalCost ??
          (result.pricePerLead !== undefined
            ? result.pricePerLead * batch.imported
            : undefined);
        purchase.status = LeadPurchaseStatus.COMPLETED;
      } else {
        // Async delivery — leads arrive via webhook/CSV later.
        purchase.status = LeadPurchaseStatus.POSTED;
      }

      await this.purchasesRepository.save(purchase);
      return { purchase };
    } catch (err) {
      if (purchase.status !== LeadPurchaseStatus.REJECTED) {
        purchase.status = LeadPurchaseStatus.FAILED;
        purchase.error = err instanceof Error ? err.message : String(err);
        await this.purchasesRepository.save(purchase);
      }
      throw this.translateVendorError(err);
    }
  }

  private translateVendorError(err: unknown): Error {
    if (err instanceof LeadVendorNotConfiguredError) {
      return new ServiceUnavailableException(err.message);
    }
    if (err instanceof LeadVendorUpstreamError) {
      return new ServiceUnavailableException(err.message);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  // ── Inbound ingestion (webhook / CSV / order results) ────────────────

  /**
   * Shared import pipeline: normalize → dedupe (phone OR email) → score →
   * persist into `leads` with source tracking. Duplicate rows are kept with
   * status='duplicate' + duplicate_of for vendor dispute audit — they are
   * never re-scored as live leads.
   */
  async importRecords(
    vendorName: string,
    records: Record<string, unknown>[],
    opts: {
      source: LeadImportBatchSource;
      filename?: string;
      costPerLead?: number;
      createdBy?: string;
    },
  ): Promise<ImportResult> {
    const vendor = vendorName.toLowerCase();
    if (!(await this.registry.isActive(vendor))) {
      throw new BadRequestException(`Lead vendor "${vendor}" is disabled`);
    }

    const batch = await this.batchesRepository.save(
      this.batchesRepository.create({
        vendorName: vendor,
        source: opts.source,
        filename: opts.filename,
        totalRows: records.length,
        status: LeadImportBatchStatus.PROCESSING,
        createdBy: opts.createdBy,
      }),
    );

    const rowErrors: { row: number; reason: string }[] = [];
    const leadIds: string[] = [];
    let imported = 0;
    let duplicates = 0;
    let invalid = 0;

    try {
      for (const [i, record] of records.entries()) {
        const { lead, problems } = normalizeVendorLead(record);

        // Uncontactable = useless: can't dedupe it or work it.
        if (!lead.phone && !lead.email) {
          invalid++;
          this.pushRowError(rowErrors, i + 1, problems.join('; ') || 'no contact info');
          continue;
        }

        const duplicate = await this.findDuplicate(lead.phone, lead.email);

        const entity = this.leadsRepository.create({
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email ?? '',
          phone: lead.phone ?? '',
          state: lead.state ?? '',
          zipCode: lead.zipCode,
          totalDebt: lead.totalDebt ?? 0,
          debtTypes: lead.debtTypes,
          tcpaConsent: lead.tcpaConsent === true,
          consentTimestamp: lead.tcpaConsent ? new Date() : undefined,
          source: `vendor:${vendor}`,
          vendorName: vendor,
          vendorLeadId: lead.vendorLeadId,
          importBatchId: batch.id,
          purchaseCost: opts.costPerLead,
          status: 'new',
        });

        if (duplicate) {
          entity.status = 'duplicate';
          entity.duplicateOf = duplicate.id;
          duplicates++;
          this.pushRowError(rowErrors, i + 1, `duplicate of lead ${duplicate.id}`);
        } else {
          const scored = this.scoring.score(lead);
          entity.qualityScore = scored.score;
          entity.qualityTier = scored.tier;
          entity.scoreFactors = scored.factors;
          imported++;
        }

        const saved = await this.leadsRepository.save(entity);
        if (!duplicate) leadIds.push(saved.id);
      }

      batch.imported = imported;
      batch.duplicates = duplicates;
      batch.invalid = invalid;
      batch.rowErrors = rowErrors.length ? rowErrors : undefined;
      batch.totalCost =
        opts.costPerLead !== undefined ? opts.costPerLead * imported : undefined;
      batch.status = LeadImportBatchStatus.COMPLETED;
      await this.batchesRepository.save(batch);

      this.logger.log(
        `Imported ${imported} leads from ${vendor} (batch ${batch.id}; ${duplicates} dupes, ${invalid} invalid)`,
      );
      return { batch, leadIds };
    } catch (err) {
      batch.status = LeadImportBatchStatus.FAILED;
      batch.error = err instanceof Error ? err.message : String(err);
      batch.imported = imported;
      batch.duplicates = duplicates;
      batch.invalid = invalid;
      batch.rowErrors = rowErrors.length ? rowErrors : undefined;
      await this.batchesRepository.save(batch);
      throw err;
    }
  }

  private pushRowError(
    rowErrors: { row: number; reason: string }[],
    row: number,
    reason: string,
  ) {
    if (rowErrors.length < 50) rowErrors.push({ row, reason });
  }

  /**
   * Dedupe key: phone (last 10 digits — catches formatting variants) OR
   * lowercased email. Matches both vendor leads and consumer assessment leads.
   */
  async findDuplicate(phone?: string, email?: string): Promise<Lead | null> {
    const phoneDigits = phone?.replace(/\D/g, '');
    const phoneTail = phoneDigits && phoneDigits.length >= 10 ? phoneDigits.slice(-10) : null;
    if (!phoneTail && !email) return null;

    const conditions: string[] = [];
    const params: Record<string, string> = {};
    if (phoneTail) {
      conditions.push(`lead.phone LIKE :phoneTail`);
      params.phoneTail = `%${phoneTail}`;
    }
    if (email) {
      conditions.push(`LOWER(lead.email) = :email`);
      params.email = email.toLowerCase();
    }

    return this.leadsRepository
      .createQueryBuilder('lead')
      .where(conditions.join(' OR '), params)
      .getOne();
  }

  /** CSV import — parse text, map rows, run the shared pipeline. */
  async importCsv(
    vendor: string,
    csvText: string,
    filename: string | undefined,
    userId: string,
  ): Promise<ImportResult> {
    const parsed = parseCsv(csvText);
    if (!parsed.headers.length || !parsed.rows.length) {
      throw new BadRequestException('CSV has no header or data rows');
    }
    const records = parsed.rows.map((row) => csvRowToRecord(parsed.headers, row));
    return this.importRecords(vendor, records, {
      source: LeadImportBatchSource.CSV,
      filename,
      createdBy: userId,
    });
  }

  /**
   * Webhook import — accepts a bare array, `{leads: [...]}`, `{lead: {...}}`,
   * or a single flat lead object.
   */
  async ingestWebhook(
    vendor: string,
    body: unknown,
    remoteRef?: string,
  ): Promise<ImportResult> {
    let records: Record<string, unknown>[];
    if (Array.isArray(body)) {
      records = body;
    } else if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if (Array.isArray(obj.leads)) {
        records = obj.leads as Record<string, unknown>[];
        remoteRef =
          remoteRef ?? (String(obj.batch_id ?? obj.id ?? '') || undefined);
      } else if (obj.lead && typeof obj.lead === 'object') {
        records = [obj.lead as Record<string, unknown>];
      } else {
        records = [obj];
      }
    } else {
      throw new BadRequestException('Webhook body must be a lead object or array');
    }
    return this.importRecords(vendor, records, {
      source: LeadImportBatchSource.WEBHOOK,
      filename: remoteRef,
    });
  }

  // ── Queries ──────────────────────────────────────────────────────────

  async listLeads(filter: ListImportedLeadsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;

    const qb = this.leadsRepository
      .createQueryBuilder('lead')
      .where('lead.vendor_name IS NOT NULL');

    if (filter.disposition === 'duplicates') {
      qb.andWhere(`lead.status = 'duplicate'`);
    } else if (filter.disposition !== 'all') {
      qb.andWhere(`lead.status != 'duplicate'`);
    }
    if (filter.vendor) {
      qb.andWhere('lead.vendor_name = :vendor', {
        vendor: filter.vendor.toLowerCase(),
      });
    }
    if (filter.batchId) {
      qb.andWhere('lead.import_batch_id = :batchId', { batchId: filter.batchId });
    }
    if (filter.minScore !== undefined) {
      qb.andWhere('lead.qualityScore >= :minScore', { minScore: filter.minScore });
    }
    if (filter.status) {
      qb.andWhere('lead.status = :status', { status: filter.status });
    }
    if (filter.search) {
      const s = `%${filter.search}%`;
      qb.andWhere(
        '(lead.firstName ILIKE :s OR lead.lastName ILIKE :s OR lead.email ILIKE :s OR lead.phone ILIKE :s)',
        { s },
      );
    }

    const [leads, total] = await qb
      .orderBy('lead.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { leads, total, page, limit };
  }

  async getLead(id: string) {
    const lead = await this.leadsRepository.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async listBatches(vendor?: string) {
    return this.batchesRepository.find({
      where: vendor ? { vendorName: vendor.toLowerCase() } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async listPurchases(vendor?: string) {
    return this.purchasesRepository.find({
      where: vendor ? { vendorName: vendor.toLowerCase() } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ── Handoff: lead → collections ──────────────────────────────────────

  /**
   * Assign an imported vendor lead to collections: create (or reuse) a CRM
   * client, open a collection account seeded with the lead's debt amount,
   * and link everything back onto the lead row. Idempotent — re-calling
   * returns the existing account.
   */
  async assignToCollections(leadId: string, userId: string) {
    const lead = await this.getLead(leadId);
    if (lead.status === 'duplicate') {
      throw new BadRequestException(
        `Lead ${leadId} is a duplicate of ${lead.duplicateOf} — assign the original instead`,
      );
    }
    if (lead.collectionAccountId) {
      const existing = await this.collectionsService.findOne(lead.collectionAccountId);
      return { account: existing, alreadyAssigned: true };
    }

    let client = await this.crmService.findClientByGroupId(lead.id);
    if (!client) {
      client = await this.crmService.createClient({
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        source: lead.vendorName ? `lead_vendor:${lead.vendorName}` : 'lead',
        userId: userId ?? 'system',
        groupId: lead.id, // link CRM client back to the source lead row
      });
    }

    const debt = Number(lead.totalDebt) || 0;
    const account = await this.collectionsService.create({
      crmClientId: client.id,
      originalBalance: debt,
      currentBalance: debt,
      status: CollectionAccountStatus.NEW,
      priority: lead.qualityScore >= 80 ? 3 : lead.qualityScore >= 60 ? 2 : 1,
      notes: `Vendor lead ${lead.id} (${lead.vendorName ?? 'internal'}, score ${lead.qualityScore})`,
      customFields: {
        leadId: lead.id,
        vendorName: lead.vendorName,
        vendorLeadId: lead.vendorLeadId,
        importBatchId: lead.importBatchId,
        purchaseCost: lead.purchaseCost,
        qualityScore: lead.qualityScore,
      },
    });

    try {
      await this.collectionsService.addNote(account.id, userId ?? 'system', {
        noteType: CollectionNoteType.GENERAL,
        content:
          `Lead assigned to collections from vendor "${lead.vendorName ?? 'internal'}" ` +
          `(lead ${lead.id}${lead.purchaseCost != null ? `, cost $${lead.purchaseCost}` : ''}` +
          `, score ${lead.qualityScore}).`,
      });
    } catch (err) {
      this.logger.warn(`Note failed for collection account ${account.id}: ${err}`);
    }

    await this.leadsRepository.update(lead.id, {
      collectionAccountId: account.id,
      status: 'converted',
      convertedAt: new Date(),
    });

    this.logger.log(
      `Lead ${lead.id} → collection account ${account.id} (vendor ${lead.vendorName ?? 'n/a'})`,
    );
    return { account, client, alreadyAssigned: false };
  }
}
