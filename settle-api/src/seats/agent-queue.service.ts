import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { OrgMember, OrgMemberStatus, OrgRole } from './org-member.entity';
import { OrgContext } from './org-role.guard';
import { DialerCall } from '../dialer/dialer-call.entity';
import { DialerCallStatus } from '../dialer/dialer-provider.interface';
import { CollectionAccount, CollectionAccountStatus } from '../entities/collection-account.entity';
import { CrmClient } from '../entities/crm-client.entity';
import { CrmLead, CrmLeadStatus } from '../entities/crm-lead.entity';
import { DebtorProfile, BankruptcyStatus } from '../entities/debtor-profile.entity';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog, ConsentType } from '../entities/consent-log.entity';
import { User } from '../entities/user.entity';
import { DispositionDto } from './dto/seats.dto';
import { fdcpaCallWindow, FdcpaWindow } from './us-state-timezone.util';

const E164_RE = /^\+[1-9]\d{6,14}$/;

const WORKABLE_ACCOUNT_STATUSES: CollectionAccountStatus[] = [
  CollectionAccountStatus.NEW,
  CollectionAccountStatus.ACTIVE,
  CollectionAccountStatus.CONTACTED,
  CollectionAccountStatus.PAYMENT_PLAN,
];

const WORKABLE_LEAD_STATUSES: CrmLeadStatus[] = [
  CrmLeadStatus.NEW,
  CrmLeadStatus.CONTACTED,
  CrmLeadStatus.QUALIFIED,
];

const IN_FLIGHT = [
  DialerCallStatus.QUEUED,
  DialerCallStatus.DIALING,
  DialerCallStatus.RINGING,
  DialerCallStatus.ANSWERED,
];

export interface QueueCompliance {
  blocked: boolean;
  reasons: string[];
  dnc: boolean;
  doNotCall: boolean;
  consentOnFile: boolean;
  fdcpa: FdcpaWindow;
}

export interface QueueItem {
  type: 'account' | 'lead';
  id: string; // accountId or leadId
  clientId?: string;
  name: string;
  phone?: string;
  status: string;
  balance?: number;
  priority?: number;
  delinquencyDays?: number;
  lastContactAt?: string;
  compliance: QueueCompliance;
}

@Injectable()
export class AgentQueueService {
  constructor(
    @InjectRepository(OrgMember) private readonly membersRepo: Repository<OrgMember>,
    @InjectRepository(DialerCall) private readonly callsRepo: Repository<DialerCall>,
    @InjectRepository(CollectionAccount) private readonly accountsRepo: Repository<CollectionAccount>,
    @InjectRepository(CrmClient) private readonly clientsRepo: Repository<CrmClient>,
    @InjectRepository(CrmLead) private readonly leadsRepo: Repository<CrmLead>,
    @InjectRepository(DebtorProfile) private readonly debtorRepo: Repository<DebtorProfile>,
    @InjectRepository(DncEntry) private readonly dncRepo: Repository<DncEntry>,
    @InjectRepository(ConsentLog) private readonly consentRepo: Repository<ConsentLog>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  /** Same convention as DialerService#normalizeE164 / ComplianceService. */
  private normalizeE164(phone: string): string {
    if (!phone) return phone;
    let trimmed = phone.trim().replace(/[\s().-]/g, '');
    if (!trimmed.startsWith('+')) {
      if (/^1\d{10}$/.test(trimmed)) trimmed = '+' + trimmed;
      else if (/^\d{10}$/.test(trimmed)) trimmed = '+1' + trimmed;
      else trimmed = '+' + trimmed;
    }
    return trimmed;
  }

  // ── Agent work queue ───────────────────────────────────────────────────

  /**
   * GET /dialer/queue — the agent's assigned collection accounts (joined to
   * their CRM contact for name/phone) plus assigned CRM leads, each with a
   * pre-dial compliance snapshot (DNC, do-not-call flag, consent on file,
   * FDCPA 8am–9pm window) so the dashboard can show the banner before the
   * agent ever clicks call.
   */
  async getQueue(ctx: OrgContext, agentId: string): Promise<{ generatedAt: string; items: QueueItem[] }> {
    const accounts = await this.accountsRepo.find({
      where: { assignedTo: agentId, status: In(WORKABLE_ACCOUNT_STATUSES) },
      order: { priority: 'DESC', delinquencyDays: 'DESC' },
      take: 60,
    });

    const leads = await this.leadsRepo.find({
      where: { userId: agentId, status: In(WORKABLE_LEAD_STATUSES) },
      order: { createdAt: 'DESC' },
      take: 40,
    });
    // Tenant scoping: keep leads with no group or this org's group.
    const scopedLeads = leads.filter((l) => !l.groupId || l.groupId === ctx.orgId);

    const clientIds = [...new Set(accounts.map((a) => a.crmClientId).filter(Boolean))];
    const [clients, profiles, lastCalls] = await Promise.all([
      clientIds.length
        ? this.clientsRepo.find({ where: { id: In(clientIds) } })
        : Promise.resolve([] as CrmClient[]),
      clientIds.length
        ? this.debtorRepo.find({ where: { crmClientId: In(clientIds) } })
        : Promise.resolve([] as DebtorProfile[]),
      clientIds.length
        ? this.callsRepo.find({
            where: { contactId: In(clientIds) },
            order: { createdAt: 'DESC' },
            take: 200,
          })
        : Promise.resolve([] as DialerCall[]),
    ]);

    const clientById = new Map(clients.map((c) => [c.id, c]));
    const profileByClient = new Map(profiles.map((p) => [p.crmClientId, p]));
    const lastCallByContact = new Map<string, DialerCall>();
    for (const c of lastCalls) {
      if (c.contactId && !lastCallByContact.has(c.contactId)) {
        lastCallByContact.set(c.contactId, c);
      }
    }

    // Batch the DNC + consent lookups for every phone in the queue.
    const phoneSet = new Set<string>();
    for (const c of clients) {
      const p = this.normalizeE164(c.phone ?? '');
      if (E164_RE.test(p)) phoneSet.add(p);
    }
    for (const l of scopedLeads) {
      const p = this.normalizeE164(l.phone ?? '');
      if (E164_RE.test(p)) phoneSet.add(p);
    }
    const phones = [...phoneSet];

    const [dncRows, consentRows] = await Promise.all([
      phones.length
        ? this.dncRepo.find({ where: { phoneNumber: In(phones) } })
        : Promise.resolve([] as DncEntry[]),
      phones.length || clientIds.length
        ? this.consentRepo.find({
            where: [
              ...(phones.length
                ? [{ phoneNumber: In(phones), consentType: ConsentType.TCPA, granted: true }]
                : []),
              ...(clientIds.length
                ? [{ clientId: In(clientIds), consentType: ConsentType.TCPA, granted: true }]
                : []),
            ],
            order: { consentTimestamp: 'DESC' },
          })
        : Promise.resolve([] as ConsentLog[]),
    ]);
    const dncPhones = new Set(dncRows.map((d) => d.phoneNumber));
    const consentPhones = new Set<string>();
    const consentClients = new Set<string>();
    const now = Date.now();
    for (const c of consentRows) {
      // Same 12-month freshness rule as DialerService#hasCallConsent.
      if (c.expiresAt && c.expiresAt.getTime() < now) continue;
      const captured = c.consentTimestamp?.getTime();
      if (captured && now - captured > 365 * 24 * 60 * 60 * 1000) continue;
      if (c.phoneNumber) consentPhones.add(c.phoneNumber);
      if (c.clientId) consentClients.add(c.clientId);
    }

    const complianceFor = (
      phone: string | undefined,
      clientId: string | undefined,
      profile: DebtorProfile | undefined,
    ): QueueCompliance => {
      const normalized = this.normalizeE164(phone ?? '');
      const validPhone = E164_RE.test(normalized);
      const dnc = validPhone && dncPhones.has(normalized);
      const doNotCall = profile?.doNotCall ?? false;
      const consentOnFile =
        (validPhone && consentPhones.has(normalized)) ||
        (clientId ? consentClients.has(clientId) : false);
      const state = profile?.addressHistory?.length
        ? profile.addressHistory[profile.addressHistory.length - 1]?.state
        : undefined;
      const fdcpa = fdcpaCallWindow(state);
      const reasons: string[] = [];
      if (!validPhone) reasons.push('no valid phone on file');
      if (dnc) reasons.push('number on Do-Not-Call list');
      if (doNotCall) reasons.push('debtor flagged do-not-call');
      if (profile?.bankruptcyStatus && profile.bankruptcyStatus !== BankruptcyStatus.NONE) {
        reasons.push(`bankruptcy: ${profile.bankruptcyStatus}`);
      }
      if (profile?.deceasedDate) reasons.push('deceased');
      if (profile?.litigiousFlag) reasons.push('litigious — handle with care');
      if (fdcpa.status === 'outside') reasons.push('outside 8am–9pm consumer local window');
      return {
        blocked: !validPhone || dnc || doNotCall || !!profile?.deceasedDate ||
          (!!profile?.bankruptcyStatus && profile.bankruptcyStatus !== BankruptcyStatus.NONE),
        reasons,
        dnc: !!dnc,
        doNotCall,
        consentOnFile: !!consentOnFile,
        fdcpa,
      };
    };

    const items: QueueItem[] = [];

    for (const a of accounts) {
      const client = clientById.get(a.crmClientId);
      const profile = profileByClient.get(a.crmClientId);
      const lastCall = lastCallByContact.get(a.crmClientId);
      items.push({
        type: 'account',
        id: a.id,
        clientId: a.crmClientId,
        name: client
          ? `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || client.email
          : 'Unknown contact',
        phone: client?.phone,
        status: a.status,
        balance: Number(a.currentBalance) || 0,
        priority: a.priority,
        delinquencyDays: a.delinquencyDays,
        lastContactAt:
          lastCall?.createdAt?.toISOString() ?? client?.lastContact?.toISOString(),
        compliance: complianceFor(client?.phone, a.crmClientId, profile),
      });
    }

    for (const l of scopedLeads) {
      items.push({
        type: 'lead',
        id: l.id,
        name: `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() || l.email,
        phone: l.phone,
        status: l.status,
        compliance: complianceFor(l.phone, undefined, undefined),
      });
    }

    return { generatedAt: new Date().toISOString(), items };
  }

  // ── Agent performance ──────────────────────────────────────────────────

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private daysAgo(n: number): Date {
    const d = this.startOfToday();
    d.setDate(d.getDate() - n);
    return d;
  }

  private async statsForAgents(agentIds: string[], since: Date) {
    if (!agentIds.length) {
      return new Map<string, { calls: number; answered: number; seconds: number; dispositions: Record<string, number> }>();
    }
    const rows = await this.callsRepo
      .createQueryBuilder('c')
      .select('c.agent_id', 'agentId')
      .addSelect('COUNT(*)', 'calls')
      .addSelect(`COUNT(*) FILTER (WHERE c.answered_at IS NOT NULL OR c.status IN ('answered','completed'))`, 'answered')
      .addSelect('COALESCE(SUM(c.duration), 0)', 'seconds')
      .where('c.agent_id IN (:...agentIds)')
      .andWhere('c.created_at >= :since')
      .groupBy('c.agent_id')
      .setParameters({ agentIds, since })
      .getRawMany<{ agentId: string; calls: string; answered: string; seconds: string }>();

    const dispRows = await this.callsRepo
      .createQueryBuilder('c')
      .select('c.agent_id', 'agentId')
      .addSelect(`COALESCE(c.disposition, 'unset')`, 'disposition')
      .addSelect('COUNT(*)', 'n')
      .where('c.agent_id IN (:...agentIds)')
      .andWhere('c.created_at >= :since')
      .groupBy('c.agent_id')
      .addGroupBy('c.disposition')
      .setParameters({ agentIds, since })
      .getRawMany<{ agentId: string; disposition: string; n: string }>();

    const map = new Map<string, { calls: number; answered: number; seconds: number; dispositions: Record<string, number> }>();
    for (const r of rows) {
      map.set(r.agentId, {
        calls: parseInt(r.calls, 10),
        answered: parseInt(r.answered, 10),
        seconds: parseInt(r.seconds, 10),
        dispositions: {},
      });
    }
    for (const d of dispRows) {
      const bucket = map.get(d.agentId) ?? { calls: 0, answered: 0, seconds: 0, dispositions: {} };
      bucket.dispositions[d.disposition] = parseInt(d.n, 10);
      map.set(d.agentId, bucket);
    }
    return map;
  }

  /** GET /dialer/my-stats — the calling agent's own rollup. */
  async myStats(agentId: string) {
    const [today, week] = await Promise.all([
      this.statsForAgents([agentId], this.startOfToday()),
      this.statsForAgents([agentId], this.daysAgo(7)),
    ]);
    const shape = (m?: { calls: number; answered: number; seconds: number; dispositions: Record<string, number> }) => ({
      calls: m?.calls ?? 0,
      answered: m?.answered ?? 0,
      avgDurationSeconds: m && m.answered > 0 ? Math.round(m.seconds / m.answered) : 0,
      dispositions: m?.dispositions ?? {},
    });
    return {
      agentId,
      today: shape(today.get(agentId)),
      week: shape(week.get(agentId)),
    };
  }

  /**
   * GET /dialer/team-stats — manager view: per-agent stats across the org,
   * plus currently in-flight calls for the live board.
   */
  async teamStats(ctx: OrgContext) {
    const members = await this.membersRepo.find({
      where: { orgId: ctx.orgId, status: OrgMemberStatus.ACTIVE },
    });
    const agentIds = members.map((m) => m.userId);
    const [today, week, liveCalls, users] = await Promise.all([
      this.statsForAgents(agentIds, this.startOfToday()),
      this.statsForAgents(agentIds, this.daysAgo(7)),
      agentIds.length
        ? this.callsRepo.find({
            where: { orgId: ctx.orgId, status: In(IN_FLIGHT) },
            order: { createdAt: 'DESC' },
            take: 50,
          })
        : Promise.resolve([] as DialerCall[]),
      agentIds.length
        ? this.usersRepo.find({ where: { id: In(agentIds) } })
        : Promise.resolve([] as User[]),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));

    const shape = (m?: { calls: number; answered: number; seconds: number; dispositions: Record<string, number> }) => ({
      calls: m?.calls ?? 0,
      answered: m?.answered ?? 0,
      avgDurationSeconds: m && m.answered > 0 ? Math.round(m.seconds / m.answered) : 0,
      dispositions: m?.dispositions ?? {},
    });

    return {
      orgId: ctx.orgId,
      agents: members.map((m) => {
        const u = userById.get(m.userId);
        return {
          userId: m.userId,
          orgRole: m.orgRole,
          email: u?.email,
          firstName: u?.firstName,
          lastName: u?.lastName,
          today: shape(today.get(m.userId)),
          week: shape(week.get(m.userId)),
        };
      }),
      liveCalls: liveCalls.map((c) => {
        const u = c.agentId ? userById.get(c.agentId) : undefined;
        return {
          id: c.id,
          agentId: c.agentId,
          agentName: u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email : undefined,
          phoneNumber: c.phoneNumber,
          status: c.status,
          startedAt: c.startedAt,
          createdAt: c.createdAt,
        };
      }),
    };
  }

  // ── Dispositions ───────────────────────────────────────────────────────

  /**
   * POST /dialer/calls/:id/disposition — set the post-call outcome. The
   * agent who placed the call can always disposition it; org
   * owners/managers can disposition any call inside their org.
   */
  async setDisposition(ctx: OrgContext, callId: string, userId: string, dto: DispositionDto): Promise<DialerCall> {
    const call = await this.callsRepo.findOne({ where: { id: callId } });
    if (!call) throw new NotFoundException('Dialer call not found');
    const ownsCall = call.agentId === userId;
    const managesOrg =
      !!call.orgId &&
      call.orgId === ctx.orgId &&
      (ctx.orgRole === OrgRole.ORG_OWNER || ctx.orgRole === OrgRole.ORG_MANAGER);
    if (!ownsCall && !managesOrg) {
      throw new ForbiddenException('You can only disposition calls in your org.');
    }
    call.disposition = dto.disposition.trim();
    call.dispositionAt = new Date();
    if (dto.notes) {
      call.notes = call.notes ? `${call.notes}\n${dto.notes}` : dto.notes;
    }
    return this.callsRepo.save(call);
  }
}
