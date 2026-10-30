import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../entities/lead.entity';
import { Org } from '../seats/org.entity';
import { SkipTraceLookup as SkipTraceLookupEntity } from '../entities/skip-trace-lookup.entity';
import { BatchDataProvider } from './batchdata.provider';
import {
  SkipTraceLookupInput,
  SkipTraceNotConfiguredError,
  SkipTraceProvider,
} from './skiptrace-provider.interface';

const BATCHDATA_COST_PER_RECORD = 0.07;

@Injectable()
export class SkiptraceService {
  private readonly logger = new Logger(SkiptraceService.name);
  private readonly providers: SkipTraceProvider[];

  constructor(
    private readonly batchdata: BatchDataProvider,
    @InjectRepository(SkipTraceLookupEntity)
    private readonly results: Repository<SkipTraceLookupEntity>,
    @InjectRepository(Lead)
    private readonly leads: Repository<Lead>,
    @InjectRepository(Org)
    private readonly orgs: Repository<Org>,
  ) {
    this.providers = [batchdata];
  }

  private active(): SkipTraceProvider {
    const p = this.providers.find((x) => x.isConfigured());
    if (!p) throw new SkipTraceNotConfiguredError('batchdata');
    return p;
  }

  /** Run a skip-trace lookup over 1..100 name+address inputs; persist the audit row. */
  async run(
    inputs: SkipTraceLookupInput[],
    meta: { leadId?: string; orgId?: string; agentId?: string },
  ) {
    if (!inputs?.length) throw new BadRequestException('At least one lookup input is required');
    if (inputs.length > 100) throw new BadRequestException('Maximum 100 inputs per batch');
    for (const i of inputs) {
      if (!i.street || !i.city || !i.state || !i.zip)
        throw new BadRequestException('street, city, state, and zip are required for each input');
    }

    const provider = this.active();
    // BYOK: org's own vendor key bypasses platform metering (cost logged as 0 —
    // the lookup bills to their vendor account, not ours).
    const org = meta.orgId ? await this.orgs.findOne({ where: { id: meta.orgId } }) : null;
    const byokKey = org?.skiptraceKey || undefined;
    const result = await provider.lookup(inputs, { apiKey: byokKey });

    // Best-first phone ordering: score desc, wireless preferred, non-DNC first.
    const allPhones = result.persons.flatMap((p) => p.phones).filter((p) => p.number);
    const sorted = allPhones.sort((a, b) => {
      const aDnc = a.dnc || a.tcpa ? 1 : 0;
      const bDnc = b.dnc || b.tcpa ? 1 : 0;
      if (aDnc !== bDnc) return aDnc - bDnc;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    const row = this.results.create({
      leadId: meta.leadId,
      orgId: meta.orgId,
      agentId: meta.agentId,
      vendor: byokKey ? `byok:${provider.name}` : provider.name,
      phones: sorted,
      matchCount: result.matchCount,
      litigator: result.persons.some((p) => p.litigator) ?? false,
      bankruptcy: result.persons.some((p) => p.bankruptcy) ?? false,
      raw: result.raw,
      costUsd: BATCHDATA_COST_PER_RECORD * inputs.length,
    });
    await this.results.save(row);

    return {
      id: row.id,
      vendor: byokKey ? `byok:${provider.name}` : provider.name,
      matchCount: result.matchCount,
      phones: sorted,
      litigator: row.litigator,
      bankruptcy: row.bankruptcy,
      costUsd: row.costUsd,
    };
  }

  /**
   * Trace a marketplace lead — pulls its stored address, runs the lookup,
   * and hydrates altPhones with ranked non-DNC wireless candidates so the
   * dialer can pick them up. Consent/DNC flags ride along on each hit.
   */
  async traceLead(leadId: string, meta: { orgId?: string; agentId?: string }) {
    const lead = await this.leads.findOne({ where: { id: leadId } });
    if (!lead) throw new BadRequestException(`Lead ${leadId} not found`);
    if (!lead.streetAddress || !lead.city || !lead.state || !lead.zipCode)
      throw new BadRequestException(`Lead ${leadId} has no full address on file — cannot trace`);

    const out = await this.run(
      [{
        firstName: lead.firstName,
        lastName: lead.lastName,
        street: lead.streetAddress,
        city: lead.city,
        state: lead.state,
        zip: lead.zipCode,
      }],
      { leadId, orgId: meta.orgId, agentId: meta.agentId },
    );

    const callable = out.phones.filter((p) => !p.dnc && !p.tcpa && p.reachable !== false);
    if (callable.length) {
      const existing = Array.isArray(lead.altPhones) ? lead.altPhones : [];
      const merged = [...new Set([...existing, ...callable.map((p) => p.number)])];
      lead.altPhones = merged as any;
      await this.leads.save(lead);
    }
    return { ...out, callable: callable.length, altPhones: lead.altPhones };
  }

  /** Recent lookups — for the org's audit/history view. */
  async history(orgId?: string, limit = 50) {
    return this.results.find({
      where: orgId ? { orgId } : {},
      order: { createdAt: 'DESC' },
      take: limit,
      select: ['id', 'leadId', 'vendor', 'matchCount', 'litigator', 'bankruptcy', 'costUsd', 'createdAt'],
    });
  }
}
