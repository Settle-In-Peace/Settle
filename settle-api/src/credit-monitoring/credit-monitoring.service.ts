import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Or, Repository } from 'typeorm';
import { CreditBureauService } from '../credit-bureau/credit-bureau.service';
import { User } from '../entities/user.entity';
import {
  CreditMonitorAlert,
  CreditMonitorAlertSeverity,
  CreditMonitorAlertType,
} from './entities/credit-monitor-alert.entity';
import { CreditMonitorEnrollment } from './entities/credit-monitor-enrollment.entity';
import { CreditMonitorSnapshot } from './entities/credit-monitor-snapshot.entity';
import { EnrollMonitoringDto } from './dto/enroll-monitoring.dto';

/** Honest default consent language — soft pull, no score impact claim only. */
const DEFAULT_CONSENT_LANGUAGE =
  'I authorize Settle In Peace to obtain my consumer credit report and score ' +
  'through its credit bureau partner for the purpose of ongoing credit ' +
  'monitoring. I understand these are soft inquiries that do not affect my ' +
  'credit score, and that I may cancel monitoring at any time.';

const SCORE_CHANGE_THRESHOLD = 10;
const BALANCE_CHANGE_THRESHOLD = 500;
const MANUAL_REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // once/day

/** Tolerant key for matching tradelines across pulls (never includes the
 *  raw account number in alert payloads — the key is for diffing only). */
function tradelineKey(t: Record<string, any>): string {
  const name = String(t.creditorName ?? t.creditor ?? t.name ?? 'unknown')
    .toLowerCase()
    .trim();
  const type = String(t.accountType ?? t.type ?? '').toLowerCase().trim();
  const acct = String(t.accountNumber ?? t.account_number ?? '');
  const tail = acct.replace(/\D/g, '').slice(-4);
  return `${name}|${type}|${tail}`;
}

function tradelineLabel(t: Record<string, any>): string {
  const name = t.creditorName ?? t.creditor ?? t.name;
  return name ? String(name) : 'An account';
}

function isDerogatory(t: Record<string, any>): boolean {
  if (t.isCollection === true || t.is_collection === true) return true;
  const status = String(t.status ?? t.accountStatus ?? '').toLowerCase();
  return /collection|charge.?off|derog|delinquen/.test(status);
}

@Injectable()
export class CreditMonitoringService {
  private readonly logger = new Logger(CreditMonitoringService.name);

  constructor(
    @InjectRepository(CreditMonitorEnrollment)
    private readonly enrollments: Repository<CreditMonitorEnrollment>,
    @InjectRepository(CreditMonitorSnapshot)
    private readonly snapshots: Repository<CreditMonitorSnapshot>,
    @InjectRepository(CreditMonitorAlert)
    private readonly alerts: Repository<CreditMonitorAlert>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly creditBureau: CreditBureauService,
    private readonly config: ConfigService,
  ) {}

  private get refreshIntervalDays(): number {
    const days = this.config.get<number>('CREDIT_MONITOR_INTERVAL_DAYS', 7);
    return Number.isFinite(days) && days > 0 ? days : 7;
  }

  /** Fail-closed — same guidance string as CreditBureauService. */
  private requireConfigured(): void {
    if (!this.creditBureau.getStatus().configured) {
      throw new ServiceUnavailableException(
        'Credit monitoring is not configured. Set MFSN_API_USER (or MFSN_API_EMAIL) and MFSN_API_PASSWORD on the API.',
      );
    }
  }

  private async getEnrollmentForUser(
    userId: string,
  ): Promise<CreditMonitorEnrollment | null> {
    return this.enrollments.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  private async requireEnrollmentForUser(
    userId: string,
  ): Promise<CreditMonitorEnrollment> {
    const enrollment = await this.getEnrollmentForUser(userId);
    if (!enrollment) {
      throw new NotFoundException(
        'No credit-monitoring enrollment found. Enroll first.',
      );
    }
    return enrollment;
  }

  // ── Enrollment ─────────────────────────────────────────────────────────

  /**
   * Enroll the authenticated user for monitoring. The consent record is
   * mandatory — no pull path exists without it. If the member email is not
   * yet enrolled at the provider the enrollment lands 'pending' with
   * guidance (provider enrollment is the existing payment-gated flow — we
   * do not auto-enroll here).
   */
  async enrollForMonitoring(
    userId: string,
    dto: EnrollMonitoringDto,
    requestMeta: { ipAddress?: string; userAgent?: string },
  ) {
    this.requireConfigured();

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const memberEmail = (dto.memberEmail ?? user.email).toLowerCase().trim();
    const consent = {
      grantedAt: dto.grantedAt ?? new Date().toISOString(),
      method: dto.method,
      ipAddress: dto.ipAddress ?? requestMeta.ipAddress,
      userAgent: dto.userAgent ?? requestMeta.userAgent,
      consentLanguage: dto.consentLanguage ?? DEFAULT_CONSENT_LANGUAGE,
    };

    let enrollment = await this.getEnrollmentForUser(userId);
    if (!enrollment) {
      enrollment = this.enrollments.create({
        userId,
        memberEmail,
        provider: 'mfsn',
        status: 'pending',
        consent,
      });
    } else {
      enrollment.memberEmail = memberEmail;
      enrollment.consent = consent;
      // Re-consenting re-queues the member-status check (unless already active).
      if (enrollment.status !== 'active') {
        enrollment.status = 'pending';
      }
    }
    enrollment = await this.enrollments.save(enrollment);

    // Is this email already an active member at the provider?
    let memberActive = false;
    let memberRef: string | undefined;
    try {
      const raw = await this.creditBureau.checkMemberStatus(memberEmail);
      const parsed = parseMemberStatus(raw);
      memberActive = parsed.active;
      memberRef = parsed.memberRef;
    } catch (err) {
      this.logger.warn(
        `checkMemberStatus failed during enroll (${(err as Error).name}) — enrollment left pending`,
      );
    }

    if (memberRef) enrollment.providerMemberRef = memberRef;

    if (memberActive) {
      enrollment.status = 'active';
      enrollment = await this.enrollments.save(enrollment);
      // Best-effort first pull so the dashboard has data immediately.
      try {
        await this.refreshEnrollment(enrollment.id);
      } catch (err) {
        this.logger.warn(
          `Initial pull failed for new enrollment (${(err as Error).name}) — will retry on the scheduled sweep`,
        );
      }
    } else {
      enrollment = await this.enrollments.save(enrollment);
    }

    return {
      enrollment: this.toPublicEnrollment(enrollment),
      memberActive,
      guidance: memberActive
        ? 'Monitoring is active. Your credit report will refresh on the regular cadence.'
        : 'Your consent is recorded. To activate monitoring, complete credit ' +
          'monitoring enrollment for this email — your account will activate ' +
          'automatically once the provider confirms membership.',
    };
  }

  // ── Pull + snapshot + diff ─────────────────────────────────────────────

  /**
   * Pull the member's 1B report, store a snapshot, diff vs the previous
   * snapshot, and emit in-app alerts. `raw` is stored (select:false) but
   * never returned or logged.
   */
  async refreshEnrollment(
    enrollmentId: string,
    opts: { manual?: boolean } = {},
  ): Promise<CreditMonitorSnapshot> {
    this.requireConfigured();

    const enrollment = await this.enrollments.findOne({
      where: { id: enrollmentId },
    });
    if (!enrollment) {
      throw new NotFoundException(`Enrollment ${enrollmentId} not found`);
    }

    // FCRA gate — no consent record, no pull. No exceptions.
    if (!enrollment.consent?.grantedAt) {
      throw new BadRequestException(
        'A recorded consent is required before any credit pull.',
      );
    }

    // Opt-out gate — paused/cancelled/unenrolled members are never pulled.
    if (['paused', 'cancelled', 'unenrolled'].includes(enrollment.status)) {
      throw new BadRequestException(
        `Monitoring is ${enrollment.status} — re-enroll to resume.`,
      );
    }

    if (
      opts.manual &&
      enrollment.lastPulledAt &&
      Date.now() - enrollment.lastPulledAt.getTime() < MANUAL_REFRESH_COOLDOWN_MS
    ) {
      throw new HttpException(
        'Your report was refreshed recently. Manual refreshes are limited to once per day.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const previous = await this.snapshots.findOne({
      where: { enrollmentId },
      order: { pulledAt: 'DESC' },
    });

    const raw = await this.creditBureau.getMemberReport({
      email: enrollment.memberEmail,
      product: 'credit',
    });

    const normalized = normalizeReport(raw);
    const snapshot = await this.snapshots.save(
      this.snapshots.create({
        enrollmentId,
        pulledAt: new Date(),
        score: normalized.score,
        scoreModel: normalized.scoreModel,
        bureau: normalized.bureau,
        tradelineCount: normalized.tradelines.length,
        tradelines: normalized.tradelines,
        inquiries: normalized.inquiries,
        publicRecords: normalized.publicRecords,
        raw,
      }),
    );

    enrollment.lastPulledAt = snapshot.pulledAt;
    if (enrollment.status === 'pending') enrollment.status = 'active';
    await this.enrollments.save(enrollment);

    if (previous) {
      await this.emitDiffAlerts(enrollmentId, previous, snapshot);
    }

    return snapshot;
  }

  /** Manual pull from POST /credit-monitoring/refresh — once/day per enrollment. */
  async manualRefresh(userId: string) {
    const enrollment = await this.requireEnrollmentForUser(userId);
    const snapshot = await this.refreshEnrollment(enrollment.id, {
      manual: true,
    });
    return { snapshot: this.toPublicSnapshot(snapshot) };
  }

  /**
   * Scheduled sweep — daily at 06:00. Pulls every active enrollment whose
   * last pull is older than CREDIT_MONITOR_INTERVAL_DAYS (default 7).
   * Fail-closed: no-ops cleanly when the provider isn't configured.
   * Per-member failures are isolated; logs carry counts only, never PII.
   */
  @Cron('0 6 * * *')
  async refreshAllDue(): Promise<{ scanned: number; ok: number; failed: number }> {
    if (!this.creditBureau.getStatus().configured) {
      this.logger.debug(
        'Credit-monitoring sweep skipped — provider not configured',
      );
      return { scanned: 0, ok: 0, failed: 0 };
    }

    const cutoff = new Date(
      Date.now() - this.refreshIntervalDays * 24 * 60 * 60 * 1000,
    );
    const due = await this.enrollments.find({
      where: {
        status: 'active',
        lastPulledAt: Or(IsNull(), LessThan(cutoff)),
      },
    });

    let ok = 0;
    let failed = 0;
    for (const enrollment of due) {
      try {
        await this.refreshEnrollment(enrollment.id);
        ok += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `Refresh failed for enrollment ${enrollment.id}: ${(err as Error).name}`,
        );
      }
    }

    this.logger.log(
      `Credit-monitoring sweep complete: ${due.length} due, ${ok} refreshed, ${failed} failed`,
    );
    return { scanned: due.length, ok, failed };
  }

  // ── Read paths (raw is never returned) ─────────────────────────────────

  async getStatus(userId: string) {
    const enrollment = await this.getEnrollmentForUser(userId);
    if (!enrollment) {
      return {
        configured: this.creditBureau.getStatus().configured,
        enrolled: false,
      };
    }
    const latest = await this.snapshots.findOne({
      where: { enrollmentId: enrollment.id },
      order: { pulledAt: 'DESC' },
    });
    const previous = latest
      ? (
          await this.snapshots.find({
            where: { enrollmentId: enrollment.id },
            order: { pulledAt: 'DESC' },
            skip: 1,
            take: 1,
          })
        )[0]
      : null;
    const unreadCount = await this.alerts.count({
      where: { enrollmentId: enrollment.id, readAt: IsNull() },
    });
    return {
      configured: this.creditBureau.getStatus().configured,
      enrolled: true,
      enrollment: this.toPublicEnrollment(enrollment),
      latestSnapshot: latest ? this.toPublicSnapshot(latest) : null,
      previousScore: previous?.score ?? null,
      unreadAlerts: unreadCount,
      refreshIntervalDays: this.refreshIntervalDays,
    };
  }

  async listSnapshots(userId: string) {
    const enrollment = await this.requireEnrollmentForUser(userId);
    const snapshots = await this.snapshots.find({
      where: { enrollmentId: enrollment.id },
      order: { pulledAt: 'DESC' },
      take: 52,
    });
    return snapshots.map((s) => this.toPublicSnapshot(s));
  }

  async listAlerts(userId: string, unreadOnly = false) {
    const enrollment = await this.requireEnrollmentForUser(userId);
    const alerts = await this.alerts.find({
      where: unreadOnly
        ? { enrollmentId: enrollment.id, readAt: IsNull() }
        : { enrollmentId: enrollment.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return alerts;
  }

  async markAlertRead(userId: string, alertId: string) {
    const enrollment = await this.requireEnrollmentForUser(userId);
    const alert = await this.alerts.findOne({ where: { id: alertId } });
    if (!alert || alert.enrollmentId !== enrollment.id) {
      throw new NotFoundException('Alert not found');
    }
    if (!alert.readAt) {
      alert.readAt = new Date();
      await this.alerts.save(alert);
    }
    return alert;
  }

  // ── Diff → alerts ──────────────────────────────────────────────────────

  private async emitDiffAlerts(
    enrollmentId: string,
    prev: CreditMonitorSnapshot,
    next: CreditMonitorSnapshot,
  ): Promise<void> {
    const toCreate: Partial<CreditMonitorAlert>[] = [];
    const push = (
      type: CreditMonitorAlertType,
      severity: CreditMonitorAlertSeverity,
      payload: CreditMonitorAlert['payload'],
    ) => toCreate.push({ enrollmentId, type, severity, payload });

    // Score change ≥10 points — warning when it drops, info when it rises.
    if (prev.score != null && next.score != null) {
      const delta = next.score - prev.score;
      if (Math.abs(delta) >= SCORE_CHANGE_THRESHOLD) {
        push(
          'score_change',
          delta < 0 ? 'warning' : 'info',
          {
            summary:
              delta < 0
                ? `Your credit score dropped ${Math.abs(delta)} points, from ${prev.score} to ${next.score}.`
                : `Your credit score rose ${delta} points, from ${prev.score} to ${next.score}.`,
            before: prev.score,
            after: next.score,
            delta,
          },
        );
      }
    }

    // Tradeline adds / removals / balance moves.
    const prevLines = new Map(
      (prev.tradelines ?? []).map((t) => [tradelineKey(t), t]),
    );
    const nextLines = new Map(
      (next.tradelines ?? []).map((t) => [tradelineKey(t), t]),
    );

    for (const [key, line] of nextLines) {
      const before = prevLines.get(key);
      if (!before) {
        push('new_tradeline', 'info', {
          summary: `A new account appeared on your report: ${tradelineLabel(line)}.`,
          creditorName: tradelineLabel(line),
          accountType: line.accountType ?? line.type ?? null,
        });
        continue;
      }
      const prevBal = Number(before.balance ?? before.currentBalance ?? 0);
      const nextBal = Number(line.balance ?? line.currentBalance ?? 0);
      const delta = nextBal - prevBal;
      if (Math.abs(delta) >= BALANCE_CHANGE_THRESHOLD) {
        push('balance_change', 'warning', {
          summary: `The balance on ${tradelineLabel(line)} changed by $${Math.abs(delta).toLocaleString()} ($${prevBal.toLocaleString()} → $${nextBal.toLocaleString()}).`,
          creditorName: tradelineLabel(line),
          before: prevBal,
          after: nextBal,
          delta,
        });
      }
    }

    for (const [key, line] of prevLines) {
      if (!nextLines.has(key)) {
        push('closed_tradeline', 'info', {
          summary: `An account no longer appears on your report: ${tradelineLabel(line)}.`,
          creditorName: tradelineLabel(line),
          accountType: line.accountType ?? line.type ?? null,
        });
      }
    }

    // New derogatory / collection — critical.
    const prevDerog = new Set(
      (prev.tradelines ?? []).filter(isDerogatory).map(tradelineKey),
    );
    const prevRecords = new Set(
      (prev.publicRecords ?? []).map((r) =>
        JSON.stringify([r.type, r.dateFiled ?? r.date_filed, r.amount]),
      ),
    );
    for (const line of next.tradelines ?? []) {
      if (isDerogatory(line) && !prevDerog.has(tradelineKey(line))) {
        push('new_derogatory', 'critical', {
          summary: `A new collection or derogatory item appeared: ${tradelineLabel(line)}. Review it promptly.`,
          creditorName: tradelineLabel(line),
        });
      }
    }
    for (const rec of next.publicRecords ?? []) {
      const key = JSON.stringify([
        rec.type,
        rec.dateFiled ?? rec.date_filed,
        rec.amount,
      ]);
      if (!prevRecords.has(key)) {
        push('new_derogatory', 'critical', {
          summary: `A new public record appeared on your report${rec.type ? ` (${String(rec.type)})` : ''}. Review it promptly.`,
          recordType: rec.type ?? null,
        });
      }
    }

    // New inquiries.
    const prevInq = new Set(
      (prev.inquiries ?? []).map((i) =>
        JSON.stringify([
          String(i.creditorName ?? i.creditor ?? '').toLowerCase(),
          i.inquiryDate ?? i.date,
        ]),
      ),
    );
    for (const inq of next.inquiries ?? []) {
      const key = JSON.stringify([
        String(inq.creditorName ?? inq.creditor ?? '').toLowerCase(),
        inq.inquiryDate ?? inq.date,
      ]);
      if (!prevInq.has(key)) {
        push('new_inquiry', 'warning', {
          summary: `A new credit inquiry was reported${(inq.creditorName ?? inq.creditor) ? ` by ${String(inq.creditorName ?? inq.creditor)}` : ''}.`,
          creditorName: inq.creditorName ?? inq.creditor ?? null,
          inquiryDate: inq.inquiryDate ?? inq.date ?? null,
        });
      }
    }

    if (toCreate.length) {
      await this.alerts.save(
        toCreate.map((a) => this.alerts.create(a)),
      );
    }
  }

  // ── Serializers — explicit field lists, `raw` can never leak ───────────

  private toPublicEnrollment(e: CreditMonitorEnrollment) {
    return {
      id: e.id,
      status: e.status,
      provider: e.provider,
      memberEmail: e.memberEmail,
      consentMethod: e.consent?.method ?? null,
      consentGrantedAt: e.consent?.grantedAt ?? null,
      lastPulledAt: e.lastPulledAt ?? null,
      createdAt: e.createdAt,
    };
  }

  private toPublicSnapshot(s: CreditMonitorSnapshot) {
    return {
      id: s.id,
      pulledAt: s.pulledAt,
      score: s.score ?? null,
      scoreModel: s.scoreModel ?? null,
      bureau: s.bureau ?? null,
      tradelineCount: s.tradelineCount,
      tradelines: s.tradelines ?? [],
      inquiries: (s.inquiries ?? []).map((i) => ({
        creditorName: i.creditorName ?? i.creditor ?? null,
        inquiryDate: i.inquiryDate ?? i.date ?? null,
        type: i.type ?? null,
      })),
      publicRecords: s.publicRecords ?? [],
      createdAt: s.createdAt,
    };
  }
}

// ── Report normalization (tolerant — provider shapes evolve) ─────────────

interface NormalizedReport {
  score?: number;
  scoreModel?: string;
  bureau?: string;
  tradelines: Record<string, any>[];
  inquiries: Record<string, any>[];
  publicRecords: Record<string, any>[];
}

function dig(raw: Record<string, any>): Record<string, any> {
  // Unwrap common envelopes: { data }, { result }, { report }.
  let node: any = raw;
  for (const key of ['data', 'result', 'report', 'creditReport']) {
    if (node && typeof node === 'object' && node[key] && typeof node[key] === 'object') {
      node = node[key];
    }
  }
  return node ?? {};
}

function firstArray(...candidates: any[]): Record<string, any>[] {
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function normalizeReport(raw: Record<string, any>): NormalizedReport {
  const d = dig(raw);

  const bureauScores = firstArray(
    d.bureaus,
    d.creditBureaus,
    d.scores ? [d.scores] : undefined,
  );

  let score: number | undefined;
  let scoreModel: string | undefined;
  let bureau: string | undefined;

  const scoreCandidate =
    d.score ?? d.creditScore ?? d.credit_score ?? d.vantageScore ?? d.ficoScore;
  if (typeof scoreCandidate === 'number') {
    score = scoreCandidate;
  } else if (scoreCandidate && typeof scoreCandidate === 'object') {
    score = scoreCandidate.score ?? scoreCandidate.value;
    scoreModel = scoreCandidate.model ?? scoreCandidate.scoreModel;
    bureau = scoreCandidate.bureau;
  }
  if (score == null && bureauScores.length) {
    const b = bureauScores[0] as Record<string, any>;
    score = b.score ?? b.creditScore;
    scoreModel = scoreModel ?? b.scoreModel ?? b.model;
    bureau = bureau ?? b.bureau ?? b.name;
  }

  const tradelines = firstArray(
    d.tradelines,
    d.tradeLines,
    d.accounts,
    d.trade_lines,
  );
  const inquiries = firstArray(d.inquiries, d.creditInquiries, d.inquiryList);
  const publicRecords = firstArray(
    d.publicRecords,
    d.public_records,
    d.publicRecordList,
  );

  return {
    score: typeof score === 'number' ? score : undefined,
    scoreModel: scoreModel ? String(scoreModel) : undefined,
    bureau: bureau ? String(bureau).toLowerCase() : undefined,
    tradelines,
    inquiries,
    publicRecords,
  };
}

/** Tolerant parse of MFSN check-status payload → { active, memberRef }. */
function parseMemberStatus(raw: Record<string, any>): {
  active: boolean;
  memberRef?: string;
} {
  const d = (raw?.data ?? raw ?? {}) as Record<string, any>;
  const flag =
    d.is_member ?? d.isMember ?? d.member ?? d.enrolled ?? d.is_member_active;
  const status = String(d.status ?? d.member_status ?? '').toLowerCase();
  const active =
    flag === true ||
    flag === 'true' ||
    flag === 1 ||
    /^(active|enrolled|member|paid)$/.test(status);
  const memberRef = d.member_id ?? d.memberId ?? d.id ?? d.correlationId;
  return { active, memberRef: memberRef ? String(memberRef) : undefined };
}
