import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
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
import { CrmLead } from '../entities/crm-lead.entity';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog, ConsentMethod, ConsentType } from '../entities/consent-log.entity';
import { SkipTraceResult, SkipTraceStatus } from '../entities/skip-trace-result.entity';
import { CrmService } from '../crm/crm.service';
import { CollectionsService } from '../collections/collections.service';
import { DialerService, CampaignContact } from '../dialer/dialer.service';
import { LeadVendorRegistry } from './vendor-registry.service';
import { VendorLeadScoringService } from './vendor-lead-scoring.service';
import { StubSkipTraceProvider } from './stub-skip-trace.provider';
import {
  SkipTraceNotConfiguredError,
  SkipTraceProvider,
} from './skip-trace-provider.interface';
import {
  LeadCriteria,
  LeadVendorNotConfiguredError,
  LeadVendorUpstreamError,
  PingResult,
} from './lead-vendor-provider.interface';
import {
  csvRowToRecord,
  normalizePhone,
  normalizeVendorLead,
  parseCsv,
} from './lead-normalizer';
import { PurchaseLeadsDto } from './dto/purchase-leads.dto';
import { ListImportedLeadsDto } from './dto/list-imported-leads.dto';
import { UpsertVendorAccountDto } from './dto/upsert-vendor-account.dto';
import { BatchSkipTraceDto } from './dto/batch-skip-trace.dto';
import { BatchCampaignDto } from './dto/batch-campaign.dto';

export interface ImportResult {
  batch: LeadImportBatch;
  leadIds: string[];
}

/** Per-row feeder detail stored on the batch (debug + dispute audit). */
interface RowDispositions {
  dedupe: { row: number; matched: 'leads' | 'crm_leads'; matchedId: string }[];
  dnc: { row: number; phone: string }[];
}

const MAX_SKIP_TRACE_PER_RUN = 500;
const DISPOSITION_LOG_CAP = 50;

@Injectable()
export class LeadVendorsService {
  private readonly logger = new Logger(LeadVendorsService.name);
  private readonly skipTraceProviders: Map<string, SkipTraceProvider>;

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
    private readonly config: ConfigService,
    private readonly dialerService: DialerService,
    private readonly stubSkipTraceProvider: StubSkipTraceProvider,
    @InjectRepository(CrmLead)
    private readonly crmLeadsRepository: Repository<CrmLead>,
    @InjectRepository(DncEntry)
    private readonly dncRepository: Repository<DncEntry>,
    @InjectRepository(ConsentLog)
    private readonly consentRepository: Repository<ConsentLog>,
    @InjectRepository(SkipTraceResult)
    private readonly skipTraceRepository: Repository<SkipTraceResult>,
  ) {
    this.skipTraceProviders = new Map<string, SkipTraceProvider>([
      ['stub', stubSkipTraceProvider],
      ['manual', stubSkipTraceProvider], // alias — the stub IS the manual queue
    ]);
  }

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
    const dispositions: RowDispositions = { dedupe: [], dnc: [] };
    const leadIds: string[] = [];
    let imported = 0;
    let duplicates = 0;
    let invalid = 0;
    let dncBlocked = 0;

    try {
      for (const [i, record] of records.entries()) {
        const { lead, problems } = normalizeVendorLead(record);

        // Uncontactable = useless: can't dedupe it or work it.
        if (!lead.phone && !lead.email) {
          invalid++;
          this.pushRowError(rowErrors, i + 1, problems.join('; ') || 'no contact info');
          continue;
        }

        const entity = this.leadsRepository.create({
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email ?? '',
          phone: lead.phone ?? '',
          altPhones: lead.altPhones,
          streetAddress: lead.streetAddress?.slice(0, 255),
          city: lead.city?.slice(0, 100),
          state: lead.state ?? '',
          zipCode: lead.zipCode?.slice(0, 10),
          totalDebt: lead.totalDebt ?? 0,
          debtTypes: lead.debtTypes,
          tcpaConsent: lead.tcpaConsent === true,
          consentTimestamp: lead.tcpaConsent ? new Date() : undefined,
          source: `vendor:${vendor}`.slice(0, 100),
          vendorName: vendor,
          vendorLeadId: lead.vendorLeadId?.slice(0, 255),
          importBatchId: batch.id,
          purchaseCost: opts.costPerLead,
          needsSkipTrace: !lead.phone,
          status: 'new',
        });

        // DNC gate — a phone already on the internal list is never imported
        // as a live lead (row kept with status='dnc_blocked' for audit).
        const dncTails = await this.findDncPhones(
          [lead.phone, ...(lead.altPhones ?? [])].filter(
            (p): p is string => !!p,
          ),
        );
        if (lead.phone && dncTails.has(phoneTail(lead.phone)!)) {
          entity.status = 'dnc_blocked';
          dncBlocked++;
          this.pushRowError(rowErrors, i + 1, `phone ${lead.phone} is on the DNC list`);
          this.pushDisposition(dispositions.dnc, { row: i + 1, phone: lead.phone });
          await this.leadsRepository.save(entity);
          continue;
        }

        // Dedupe — `leads` table first, then the importer's own crm_leads book.
        const duplicate = await this.findDuplicate(lead.phone, lead.email);
        const crmDuplicate =
          duplicate
            ? null
            : await this.findCrmDuplicate(lead.phone, lead.email, opts.createdBy);

        if (duplicate || crmDuplicate) {
          entity.status = 'duplicate';
          entity.duplicateOf = duplicate?.id;
          duplicates++;
          const matchedId = duplicate?.id ?? crmDuplicate!.id;
          this.pushRowError(
            rowErrors,
            i + 1,
            `duplicate of ${duplicate ? 'lead' : 'crm_lead'} ${matchedId}`,
          );
          this.pushDisposition(dispositions.dedupe, {
            row: i + 1,
            matched: duplicate ? 'leads' : 'crm_leads',
            matchedId,
          });
        } else {
          const scored = this.scoring.score(lead);
          entity.qualityScore = scored.score;
          entity.qualityTier = scored.tier;
          entity.scoreFactors = scored.factors;
          imported++;
        }

        const saved = await this.leadsRepository.save(entity);
        if (!duplicate && !crmDuplicate) leadIds.push(saved.id);
      }

      batch.imported = imported;
      batch.duplicates = duplicates;
      batch.invalid = invalid;
      batch.dncBlocked = dncBlocked;
      batch.rowErrors = rowErrors.length ? rowErrors : undefined;
      batch.metadata = {
        ...(batch.metadata ?? {}),
        dedupe: dispositions.dedupe.length ? dispositions.dedupe : undefined,
        dnc: dispositions.dnc.length ? dispositions.dnc : undefined,
      };
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
      batch.dncBlocked = dncBlocked;
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

  /** Bounded detail log for batch.metadata (first ~50 rows per kind). */
  private pushDisposition<T extends { row: number }>(list: T[], entry: T) {
    if (list.length < DISPOSITION_LOG_CAP) list.push(entry);
  }

  /**
   * Dedupe key: phone (last 10 digits — catches formatting variants) OR
   * lowercased email. Matches both vendor leads and consumer assessment leads.
   */
  async findDuplicate(phone?: string, email?: string): Promise<Lead | null> {
    const tail = phone ? phoneTail(phone) : null;
    if (!tail && !email) return null;

    const conditions: string[] = [];
    const params: Record<string, string> = {};
    if (tail) {
      conditions.push(`lead.phone LIKE :phoneTail`);
      params.phoneTail = `%${tail}`;
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

  /**
   * Dedupe against the sales CRM book (`crm_leads`): phone tail OR lowercased
   * email. Scoped to the importing user when known ("same org" — their book
   * of leads); webhook/API imports without a staff user check the whole CRM.
   */
  private async findCrmDuplicate(
    phone?: string,
    email?: string,
    ownerUserId?: string,
  ): Promise<CrmLead | null> {
    const tail = phone ? phoneTail(phone) : null;
    if (!tail && !email) return null;

    const conditions: string[] = [];
    const params: Record<string, string> = {};
    if (tail) {
      conditions.push(`crm.phone LIKE :phoneTail`);
      params.phoneTail = `%${tail}`;
    }
    if (email) {
      conditions.push(`LOWER(crm.email) = :email`);
      params.email = email.toLowerCase();
    }

    const qb = this.crmLeadsRepository
      .createQueryBuilder('crm')
      .where(`(${conditions.join(' OR ')})`, params);
    if (ownerUserId) qb.andWhere('crm.userId = :uid', { uid: ownerUserId });
    return qb.getOne();
  }

  /**
   * Which of these numbers sit on `crm_dnc_list`? Returns the set of matched
   * last-10-digit tails — callers compare with phoneTail(candidate).
   */
  private async findDncPhones(phones: string[]): Promise<Set<string>> {
    const tails = [
      ...new Set(
        phones
          .map((p) => phoneTail(p))
          .filter((t): t is string => !!t),
      ),
    ];
    if (!tails.length) return new Set();

    const where = tails.map((_, i) => `dnc.phoneNumber LIKE :t${i}`).join(' OR ');
    const params = Object.fromEntries(tails.map((t, i) => [`t${i}`, `%${t}`]));
    const rows = await this.dncRepository
      .createQueryBuilder('dnc')
      .where(where, params)
      .getMany();
    return new Set(
      rows
        .map((r) => phoneTail(r.phoneNumber))
        .filter((t): t is string => !!t),
    );
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
   * File upload dispatcher — picks the parser by content-type or extension:
   * `.xlsx` workbooks go through the SheetJS parser (first worksheet), every-
   * thing else is treated as CSV text.
   */
  async importFile(
    vendor: string,
    file: Buffer,
    filename: string | undefined,
    contentType: string | undefined,
    userId: string,
  ): Promise<ImportResult> {
    const isXlsx =
      /\.xlsx$/i.test(filename ?? '') ||
      /spreadsheetml|ms-excel/i.test(contentType ?? '');
    if (isXlsx) return this.importXlsx(vendor, file, filename, userId);
    const csv = file.toString('utf8');
    if (!csv.trim()) throw new BadRequestException('csv content is empty');
    return this.importCsv(vendor, csv, filename, userId);
  }

  /**
   * Excel (.xlsx) import — the first worksheet is flattened to header+row
   * records and fed through the exact same normalize → dedupe → score →
   * persist pipeline as CSV (all ~40 header aliases apply).
   */
  async importXlsx(
    vendor: string,
    buf: Buffer,
    filename: string | undefined,
    userId: string,
  ): Promise<ImportResult> {
    let records: Record<string, string>[];
    try {
      const wb = XLSX.read(buf, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = sheet
        ? XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: '',
            raw: false,
            blankrows: false,
          })
        : [];
      const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim());
      records = aoa
        .slice(1)
        .map((row) =>
          csvRowToRecord(
            headers,
            (row as unknown[]).map((c) => (c === undefined || c === null ? '' : String(c))),
          ),
        );
    } catch (err) {
      throw new BadRequestException(
        `Could not parse XLSX file: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!records.length) {
      throw new BadRequestException('XLSX has no header or data rows');
    }
    return this.importRecords(vendor, records, {
      source: LeadImportBatchSource.XLSX,
      filename,
      createdBy: userId,
    });
  }

  // ── Feeder chain: batch → skip-trace queue → dialer campaign ─────────

  /** Active skip-trace provider — `SKIP_TRACE_PROVIDER` (default 'stub'). */
  private getSkipTraceProvider(): SkipTraceProvider {
    const name = this.config
      .get<string>('SKIP_TRACE_PROVIDER', 'stub')
      .toLowerCase();
    const provider = this.skipTraceProviders.get(name);
    if (!provider) {
      throw new BadRequestException(`Unknown skip-trace provider: ${name}`);
    }
    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        new SkipTraceNotConfiguredError(name).message,
      );
    }
    return provider;
  }

  /**
   * Queue skip-trace lookups for a batch's phoneless leads. Each lead gets a
   * `skip_trace_results` row (idempotent — re-running skips leads that
   * already have one). The provider's phones merge back onto the lead
   * (primary + altPhones) and clear `needsSkipTrace`; the stub provider
   * leaves rows at status='manual' for human review. `estimatedCost` is
   * recorded per row for later billing.
   */
  async queueBatchSkipTrace(
    batchId: string,
    userId: string,
    dto: BatchSkipTraceDto,
  ) {
    const batch = await this.getBatch(batchId);
    const provider = this.getSkipTraceProvider();
    const cap = Math.min(
      Math.max(1, dto?.maxLookups ?? MAX_SKIP_TRACE_PER_RUN),
      MAX_SKIP_TRACE_PER_RUN,
    );

    const leads = await this.leadsRepository
      .createQueryBuilder('lead')
      .where('lead.importBatchId = :batchId', { batchId })
      .andWhere(`lead.status NOT IN ('duplicate', 'dnc_blocked')`)
      .andWhere(`(lead.needsSkipTrace = true OR lead.phone IS NULL OR lead.phone = '')`)
      .orderBy('lead.createdAt', 'ASC')
      .take(cap)
      .getMany();

    const skipped: { leadId: string; reason: string }[] = [];
    const results: {
      leadId: string;
      resultId: string;
      status: SkipTraceStatus;
      phonesFound: number;
    }[] = [];
    let found = 0;
    let manual = 0;
    let failed = 0;
    let estimatedCost = 0;

    for (const lead of leads) {
      // One queued result per lead — re-runs are no-ops for queued leads.
      const existing = await this.skipTraceRepository.findOne({
        where: { leadId: lead.id },
      });
      if (existing) {
        skipped.push({ leadId: lead.id, reason: 'already_queued' });
        continue;
      }

      const row = this.skipTraceRepository.create({
        leadId: lead.id,
        importBatchId: batch.id,
        collectionAccountId: lead.collectionAccountId,
        requestedBy: userId,
        provider: provider.name,
        status: SkipTraceStatus.PENDING,
        searchCriteria: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          address: lead.streetAddress,
          city: lead.city,
          state: lead.state || undefined,
          zip: lead.zipCode,
        },
      });
      const saved = await this.skipTraceRepository.save(row);

      try {
        const res = await provider.lookup({
          leadId: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          streetAddress: lead.streetAddress,
          city: lead.city,
          state: lead.state || undefined,
          zip: lead.zipCode,
          email: lead.email || undefined,
        });

        saved.status = res.status as SkipTraceStatus;
        saved.phones = res.phones;
        saved.addresses = res.addresses;
        saved.emails = res.emails;
        saved.confidence = res.confidence ?? 0;
        saved.estimatedCost = res.estimatedCost ?? 0;
        saved.notes = res.notes;
        saved.rawResponse = res.raw;
        estimatedCost += Number(res.estimatedCost ?? 0);

        // Found phones merge back onto the lead (E.164, deduped).
        const phones = (res.phones ?? [])
          .map((p) => normalizePhone(p.number))
          .filter((p): p is string => !!p);
        if (phones.length) {
          const merged = [...(lead.altPhones ?? []), ...phones];
          if (!lead.phone) lead.phone = phones[0];
          lead.altPhones = [
            ...new Set(merged.filter((p) => p !== lead.phone)),
          ];
          lead.needsSkipTrace = false;
          await this.leadsRepository.save(lead);
          if (saved.status !== SkipTraceStatus.MANUAL) found++;
        }
        if (saved.status === SkipTraceStatus.MANUAL) manual++;
        if (saved.status === SkipTraceStatus.FAILED) failed++;

        await this.skipTraceRepository.save(saved);
        results.push({
          leadId: lead.id,
          resultId: saved.id,
          status: saved.status,
          phonesFound: phones.length,
        });
      } catch (err) {
        saved.status = SkipTraceStatus.FAILED;
        saved.notes = err instanceof Error ? err.message : String(err);
        await this.skipTraceRepository.save(saved);
        failed++;
        results.push({
          leadId: lead.id,
          resultId: saved.id,
          status: saved.status,
          phonesFound: 0,
        });
      }
    }

    batch.metadata = {
      ...(batch.metadata ?? {}),
      skipTrace: {
        provider: provider.name,
        processed: results.length,
        found,
        manual,
        failed,
        skippedAlreadyQueued: skipped.length,
        estimatedCost: Math.round(estimatedCost * 10000) / 10000,
        at: new Date().toISOString(),
      },
    };
    await this.batchesRepository.save(batch);

    this.logger.log(
      `Skip-trace batch ${batch.id}: ${results.length} lookups via ${provider.name} ` +
        `(${found} phones found, ${manual} manual, ${failed} failed, ~$${estimatedCost.toFixed(4)})`,
    );
    return {
      batchId: batch.id,
      provider: provider.name,
      processed: results.length,
      found,
      manual,
      failed,
      skipped,
      estimatedCost,
      results,
    };
  }

  /** Skip-trace rows for a batch — the review queue. */
  async listBatchSkipTraces(batchId: string) {
    const batch = await this.getBatch(batchId);
    const results = await this.skipTraceRepository.find({
      where: { importBatchId: batch.id },
      order: { createdAt: 'DESC' },
    });
    return { batchId: batch.id, results };
  }

  /**
   * Chain an import batch into a dialer campaign. Each lead resolves to one
   * contact (first dialable phone: primary, then altPhones); phoneless and
   * DNC rows are skipped with reasons. The campaign itself runs the SAME
   * DNC + consent gates per call — nothing is bypassed. Leads whose file
   * asserted TCPA consent get a stored ConsentLog (method='imported') so the
   * dialer's stored-consent gate finds real evidence, not just attestation.
   */
  async startBatchCampaign(
    batchId: string,
    userId: string,
    dto: BatchCampaignDto,
  ) {
    if (!dto?.consentConfirmed) {
      throw new BadRequestException(
        'Campaign dialing requires confirmed consent (consentConfirmed=true)',
      );
    }
    const batch = await this.getBatch(batchId);

    const leads = await this.leadsRepository.find({
      where: { importBatchId: batch.id },
      order: { createdAt: 'ASC' },
    });

    const contacts: CampaignContact[] = [];
    const skipped: { leadId: string; reason: string }[] = [];

    for (const lead of leads) {
      if (
        ['duplicate', 'dnc_blocked', 'rejected', 'expired'].includes(lead.status)
      ) {
        skipped.push({ leadId: lead.id, reason: `status_${lead.status}` });
        continue;
      }
      const phones = [lead.phone, ...(lead.altPhones ?? [])].filter(
        (p): p is string => !!p,
      );
      if (!phones.length) {
        skipped.push({ leadId: lead.id, reason: 'no_phone' });
        continue;
      }
      const dncTails = await this.findDncPhones(phones);
      const dialable = phones.find((p) => !dncTails.has(phoneTail(p)!));
      if (!dialable) {
        skipped.push({ leadId: lead.id, reason: 'dnc' });
        continue;
      }
      if (lead.tcpaConsent) {
        await this.recordImportedConsent(lead, dialable);
      }
      contacts.push({
        to: dialable,
        collectionAccountId: lead.collectionAccountId,
      });
    }

    let campaignId: string | null = null;
    let queued = 0;
    if (contacts.length) {
      const started = await this.dialerService.startCampaign(userId, {
        contacts,
        consentConfirmed: true,
      });
      campaignId = started.campaignId;
      queued = started.queued;
    }

    batch.metadata = {
      ...(batch.metadata ?? {}),
      campaign: {
        campaignId,
        queued,
        skipped: skipped.length,
        at: new Date().toISOString(),
      },
    };
    await this.batchesRepository.save(batch);

    this.logger.log(
      `Batch ${batch.id} → campaign ${campaignId ?? 'none'} ` +
        `(${queued} queued, ${skipped.length} skipped)`,
    );
    return { campaignId, queued, skipped };
  }

  /** Record a vendor-imported TCPA consent so dialer stored-consent sees it. */
  private async recordImportedConsent(lead: Lead, phone: string) {
    const existing = await this.consentRepository.findOne({
      where: {
        phoneNumber: phone,
        consentType: ConsentType.TCPA,
        granted: true,
      },
    });
    if (existing) return;
    await this.consentRepository.save(
      this.consentRepository.create({
        leadId: lead.id,
        phoneNumber: phone,
        emailAddress: lead.email || undefined,
        consentType: ConsentType.TCPA,
        consentMethod: ConsentMethod.IMPORTED,
        granted: true,
        consentLanguage: `TCPA consent asserted by lead vendor "${lead.vendorName ?? 'internal'}" import (batch ${lead.importBatchId ?? 'n/a'})`,
        consentTimestamp: lead.consentTimestamp ?? new Date(),
      }),
    );
  }

  private async getBatch(batchId: string) {
    const batch = await this.batchesRepository.findOne({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('Import batch not found');
    return batch;
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
      .where('lead.vendorName IS NOT NULL');

    if (filter.disposition === 'duplicates') {
      qb.andWhere(`lead.status = 'duplicate'`);
    } else if (filter.disposition !== 'all') {
      qb.andWhere(`lead.status != 'duplicate'`);
    }
    if (filter.vendor) {
      qb.andWhere('lead.vendorName = :vendor', {
        vendor: filter.vendor.toLowerCase(),
      });
    }
    if (filter.batchId) {
      qb.andWhere('lead.importBatchId = :batchId', { batchId: filter.batchId });
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

/** Last-10-digit tail for suffix phone matching (works on E.164 + raw). */
function phoneTail(phone: string): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}
