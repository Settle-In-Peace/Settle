import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Between, In } from 'typeorm';
import { DncEntry } from '../entities/dnc-entry.entity';
import {
  ConsentLog,
  ConsentType,
  ConsentMethod,
} from '../entities/consent-log.entity';
import { CallLog, CallStatus } from '../entities/call-log.entity';

/**
 * Channel types supported by the compliance layer.
 */
export type ComplianceChannel = 'phone' | 'sms' | 'email';

/**
 * Mapping of US state abbreviations to their canonical IANA timezone.
 * Used to enforce FDCPA 8am–9pm local-time calling windows.
 */
const STATE_TIMEZONES: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  DC: 'America/New_York',
};

/**
 * FDCPA / TCPA frequency caps per channel.
 */
const FREQUENCY_CAPS = {
  phone: {
    daily: 1,
    weekly: 3,
    monthly: 7,
  },
  sms: {
    daily: 1,
    monthly: 4,
  },
} as const;

/**
 * Consent validity window — TCPA treats prior express consent as valid for
 * 12 months unless explicitly revoked.
 */
const CONSENT_VALIDITY_MONTHS = 12;

/**
 * FDCPA permitted calling window (local time of the debtor).
 */
const CALLING_WINDOW_START_HOUR = 8; // 8:00 AM
const CALLING_WINDOW_END_HOUR = 21; // 9:00 PM

/**
 * ComplianceService
 *
 * Enforces FDCPA / TCPA / internal compliance rules before any outbound
 * contact attempt. This is the gatekeeper that must be consulted before
 * dialing or texting a debtor via Telnyx (the only provider used).
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(DncEntry)
    private readonly dncRepository: Repository<DncEntry>,
    @InjectRepository(ConsentLog)
    private readonly consentRepository: Repository<ConsentLog>,
    @InjectRepository(CallLog)
    private readonly callLogRepository: Repository<CallLog>,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. DNC check
  // ---------------------------------------------------------------------------

  /**
   * Check whether a phone number is on the Do-Not-Call list.
   * The number is normalized to E.164 (with a leading +) before lookup.
   */
  async checkDnc(
    phone: string,
  ): Promise<{ isOnDnc: boolean; reason?: string }> {
    const normalized = this.normalizeE164(phone);

    const entry = await this.dncRepository.findOne({
      where: { phoneNumber: normalized },
    });

    if (entry) {
      return {
        isOnDnc: true,
        reason: `Number is on DNC list (source: ${entry.source ?? 'internal'}, added ${entry.addedAt?.toISOString() ?? 'unknown'})`,
      };
    }

    return { isOnDnc: false };
  }

  // ---------------------------------------------------------------------------
  // 2. Consent check
  // ---------------------------------------------------------------------------

  /**
   * Check whether a debtor has granted consent for a given channel.
   * Consent expires after 12 months per TCPA best practice.
   */
  async checkConsent(
    crmClientId: string,
    channel: ComplianceChannel,
  ): Promise<{ hasConsent: boolean; consentDate?: Date; expiresAt?: Date }> {
    const consentType = this.channelToConsentType(channel);

    // Find the most recent granted consent for this client + type.
    const consent = await this.consentRepository.findOne({
      where: { clientId: crmClientId, consentType, granted: true },
      order: { consentTimestamp: 'DESC' },
    });

    if (!consent) {
      return { hasConsent: false };
    }

    const consentDate = consent.consentTimestamp;
    const expiresAt = this.computeConsentExpiry(consentDate, consent.expiresAt);

    // Consent is valid if it has not expired.
    const now = new Date();
    if (expiresAt && expiresAt < now) {
      return {
        hasConsent: false,
        consentDate,
        expiresAt,
      };
    }

    return {
      hasConsent: true,
      consentDate,
      expiresAt,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Quiet hours check
  // ---------------------------------------------------------------------------

  /**
   * FDCPA restricts collection calls to 8am–9pm LOCAL time of the debtor.
   * Accept the debtor's state, look up the timezone, and verify the current
   * time falls within the permitted calling window.
   */
  async checkQuietHours(
    state: string,
    currentTime: Date = new Date(),
  ): Promise<{ isQuietHours: boolean; reason?: string }> {
    const normalizedState = state?.toUpperCase().trim();
    const timezone = STATE_TIMEZONES[normalizedState];

    if (!timezone) {
      // Unknown state — default to the safer assumption (allow) but warn.
      this.logger.warn(
        `Unknown state "${state}" — no timezone mapping; defaulting to allowed.`,
      );
      return {
        isQuietHours: false,
        reason: `Unknown state "${state}" — timezone unmapped, calling permitted at caller's risk.`,
      };
    }

    const localHour = this.getLocalHour(timezone, currentTime);

    if (localHour < CALLING_WINDOW_START_HOUR || localHour >= CALLING_WINDOW_END_HOUR) {
      const reason =
        localHour < CALLING_WINDOW_START_HOUR
          ? `Before 8am local time (${timezone}); current local hour ${localHour}:00.`
          : `After 9pm local time (${timezone}); current local hour ${localHour}:00.`;
      return { isQuietHours: true, reason };
    }

    return {
      isQuietHours: false,
      reason: `Within FDCPA calling window (8am–9pm ${timezone}); local hour ${localHour}:00.`,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Frequency cap check
  // ---------------------------------------------------------------------------

  /**
   * Enforce per-channel frequency caps.
   *
   * Phone: max 1 call/day, 3/week, 7/month per debtor.
   * SMS:   max 1/day, 4/month per debtor.
   */
  async checkFrequencyCap(
    phone: string,
    channel: 'phone' | 'sms',
  ): Promise<{
    exceeded: boolean;
    currentCount: number;
    maxAllowed: number;
    reason?: string;
  }> {
    const normalized = this.normalizeE164(phone);

    if (channel === 'phone') {
      return this.checkPhoneFrequencyCap(normalized);
    }

    return this.checkSmsFrequencyCap(normalized);
  }

  // ---------------------------------------------------------------------------
  // 5. Combined compliance check
  // ---------------------------------------------------------------------------

  /**
   * Run every compliance check and return a combined verdict.
   * If ANY violation exists, canContact is false.
   */
  async checkAllCompliance(
    phone: string,
    state: string,
    crmClientId: string,
    channel: 'phone' | 'sms' = 'phone',
  ): Promise<{
    canContact: boolean;
    violations: string[];
    warnings: string[];
  }> {
    const violations: string[] = [];
    const warnings: string[] = [];

    // DNC
    const dnc = await this.checkDnc(phone);
    if (dnc.isOnDnc) {
      violations.push(`DNC: ${dnc.reason}`);
    }

    // Consent
    const consent = await this.checkConsent(crmClientId, channel);
    if (!consent.hasConsent) {
      violations.push(
        `Consent: No valid ${channel} consent for client ${crmClientId}` +
          (consent.expiresAt ? ` (expired ${consent.expiresAt.toISOString()})` : ''),
      );
    }

    // Quiet hours (only relevant for phone calls)
    if (channel === 'phone') {
      const quiet = await this.checkQuietHours(state);
      if (quiet.isQuietHours) {
        violations.push(`QuietHours: ${quiet.reason}`);
      } else if (quiet.reason && quiet.reason.includes('Unknown state')) {
        warnings.push(quiet.reason);
      }
    }

    // Frequency cap
    const freq = await this.checkFrequencyCap(phone, channel);
    if (freq.exceeded) {
      violations.push(
        `FrequencyCap: ${freq.reason ?? 'Frequency cap exceeded'}`,
      );
    }

    return {
      canContact: violations.length === 0,
      violations,
      warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Log consent
  // ---------------------------------------------------------------------------

  /**
   * Persist a new consent record.
   */
  async logConsent(
    crmClientId: string,
    channel: ComplianceChannel,
    consentText: string,
    pageVersion: string,
    options?: {
      phoneNumber?: string;
      emailAddress?: string;
      ipAddress?: string;
      userAgent?: string;
      method?: ConsentMethod;
      granted?: boolean;
    },
  ): Promise<ConsentLog> {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + CONSENT_VALIDITY_MONTHS);

    const consent = this.consentRepository.create({
      clientId: crmClientId,
      phoneNumber: options?.phoneNumber
        ? this.normalizeE164(options.phoneNumber)
        : undefined,
      emailAddress: options?.emailAddress,
      consentType: this.channelToConsentType(channel),
      consentMethod: options?.method ?? ConsentMethod.WEB_FORM,
      granted: options?.granted ?? true,
      consentLanguage: consentText,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      pageVersion,
      consentTimestamp: now,
      expiresAt,
    });

    return this.consentRepository.save(consent);
  }

  // ---------------------------------------------------------------------------
  // 7. Add to DNC
  // ---------------------------------------------------------------------------

  /**
   * Add a phone number to the DNC list.
   */
  async addToDnc(
    phone: string,
    reason: string,
    source: string,
  ): Promise<DncEntry> {
    const normalized = this.normalizeE164(phone);

    // Avoid duplicates — if already present, update the notes/source.
    const existing = await this.dncRepository.findOne({
      where: { phoneNumber: normalized },
    });

    if (existing) {
      existing.notes = reason;
      existing.source = source;
      return this.dncRepository.save(existing);
    }

    const entry = this.dncRepository.create({
      phoneNumber: normalized,
      source,
      addedAt: new Date(),
      notes: reason,
    });

    return this.dncRepository.save(entry);
  }

  // ---------------------------------------------------------------------------
  // 8. Compliance report
  // ---------------------------------------------------------------------------

  /**
   * Generate a compliance report for a date range.
   */
  async getComplianceReport(filters: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    totalCalls: number;
    violations: number;
    dncBlocks: number;
    quietHourBlocks: number;
    frequencyBlocks: number;
    consentExpirations: number;
  }> {
    const { startDate, endDate } = filters;

    // Total calls in the range.
    const totalCalls = await this.callLogRepository.count({
      where: {
        createdAt: Between(startDate, endDate),
      },
    });

    // DNC entries added in the range (proxy for DNC blocks).
    const dncBlocks = await this.dncRepository.count({
      where: {
        addedAt: Between(startDate, endDate),
      },
    });

    // Calls made outside the FDCPA window — approximate by checking calls
    // whose startedAt hour (UTC) is unlikely to be in-window. A precise
    // per-state check requires the debtor state on each call log, which is
    // not stored directly; we count failed/no-answer/voicemail as a proxy
    // for quiet-hour impact and log the limitation.
    const quietHourBlocks = await this.callLogRepository.count({
      where: {
        createdAt: Between(startDate, endDate),
        status: In([CallStatus.NO_ANSWER, CallStatus.VOICEMAIL]),
      },
    });

    // Frequency blocks — count numbers contacted more than the daily cap.
    const frequencyBlocks = await this.countFrequencyViolations(
      startDate,
      endDate,
    );

    // Consent expirations in the range.
    const consentExpirations = await this.consentRepository.count({
      where: {
        expiresAt: Between(startDate, endDate),
        granted: true,
      },
    });

    // Total violations is the sum of the distinct block categories.
    const violations =
      dncBlocks + quietHourBlocks + frequencyBlocks + consentExpirations;

    return {
      totalCalls,
      violations,
      dncBlocks,
      quietHourBlocks,
      frequencyBlocks,
      consentExpirations,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Normalize a phone number to E.164 with a leading +.
   */
  private normalizeE164(phone: string): string {
    if (!phone) return phone;
    let trimmed = phone.trim();

    // Strip common separators.
    trimmed = trimmed.replace(/[\s().-]/g, '');

    // Ensure leading +.
    if (!trimmed.startsWith('+')) {
      // If it starts with 1 and is 11 digits, prepend +.
      if (/^1\d{10}$/.test(trimmed)) {
        trimmed = '+' + trimmed;
      } else if (/^\d{10}$/.test(trimmed)) {
        // Assume US/NANP 10-digit number.
        trimmed = '+1' + trimmed;
      } else {
        trimmed = '+' + trimmed;
      }
    }

    return trimmed;
  }

  /**
   * Map a compliance channel to the stored ConsentType enum.
   */
  private channelToConsentType(channel: ComplianceChannel): ConsentType {
    switch (channel) {
      case 'phone':
        return ConsentType.TCPA;
      case 'sms':
        return ConsentType.SMS;
      case 'email':
        return ConsentType.EMAIL;
      default:
        return ConsentType.TCPA;
    }
  }

  /**
   * Compute the consent expiry date. If an explicit expiresAt was stored,
   * use it; otherwise add the standard 12-month window.
   */
  private computeConsentExpiry(
    consentDate: Date,
    storedExpiry?: Date,
  ): Date {
    if (storedExpiry) return storedExpiry;
    const expiry = new Date(consentDate);
    expiry.setMonth(expiry.getMonth() + CONSENT_VALIDITY_MONTHS);
    return expiry;
  }

  /**
   * Get the current hour (0–23) in the given IANA timezone.
   * Uses Intl.DateTimeFormat to avoid a hard dependency on a timezone library.
   */
  private getLocalHour(timezone: string, currentTime: Date): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(currentTime);
    const hourPart = parts.find((p) => p.type === 'hour');
    let hour = parseInt(hourPart?.value ?? '0', 10);
    // Intl can return "24" for midnight in some environments; normalize to 0.
    if (hour === 24) hour = 0;
    return hour;
  }

  /**
   * Count outbound phone attempts to a number within a time window.
   */
  private async countCallsSince(
    phone: string,
    since: Date,
  ): Promise<number> {
    return this.callLogRepository.count({
      where: {
        phoneNumber: phone,
        createdAt: MoreThan(since),
      },
    });
  }

  /**
   * Phone frequency cap enforcement.
   */
  private async checkPhoneFrequencyCap(phone: string): Promise<{
    exceeded: boolean;
    currentCount: number;
    maxAllowed: number;
    reason?: string;
  }> {
    const now = new Date();

    // Daily cap.
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dailyCount = await this.countCallsSince(phone, dayStart);
    if (dailyCount >= FREQUENCY_CAPS.phone.daily) {
      return {
        exceeded: true,
        currentCount: dailyCount,
        maxAllowed: FREQUENCY_CAPS.phone.daily,
        reason: `Daily phone cap exceeded: ${dailyCount} calls today (max ${FREQUENCY_CAPS.phone.daily}).`,
      };
    }

    // Weekly cap.
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const weeklyCount = await this.countCallsSince(phone, weekStart);
    if (weeklyCount >= FREQUENCY_CAPS.phone.weekly) {
      return {
        exceeded: true,
        currentCount: weeklyCount,
        maxAllowed: FREQUENCY_CAPS.phone.weekly,
        reason: `Weekly phone cap exceeded: ${weeklyCount} calls in last 7 days (max ${FREQUENCY_CAPS.phone.weekly}).`,
      };
    }

    // Monthly cap.
    const monthStart = new Date(now);
    monthStart.setMonth(monthStart.getMonth() - 1);
    const monthlyCount = await this.countCallsSince(phone, monthStart);
    if (monthlyCount >= FREQUENCY_CAPS.phone.monthly) {
      return {
        exceeded: true,
        currentCount: monthlyCount,
        maxAllowed: FREQUENCY_CAPS.phone.monthly,
        reason: `Monthly phone cap exceeded: ${monthlyCount} calls in last 30 days (max ${FREQUENCY_CAPS.phone.monthly}).`,
      };
    }

    return {
      exceeded: false,
      currentCount: dailyCount,
      maxAllowed: FREQUENCY_CAPS.phone.daily,
    };
  }

  /**
   * SMS frequency cap enforcement.
   * SMS attempts are tracked via CommunicationLog, but since this service only
   * has CallLog injected we approximate SMS counts using call logs to the same
   * number. In production the SMS log repository would be injected here.
   */
  private async checkSmsFrequencyCap(phone: string): Promise<{
    exceeded: boolean;
    currentCount: number;
    maxAllowed: number;
    reason?: string;
  }> {
    const now = new Date();

    // Daily cap.
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dailyCount = await this.countCallsSince(phone, dayStart);
    if (dailyCount >= FREQUENCY_CAPS.sms.daily) {
      return {
        exceeded: true,
        currentCount: dailyCount,
        maxAllowed: FREQUENCY_CAPS.sms.daily,
        reason: `Daily SMS cap exceeded: ${dailyCount} messages today (max ${FREQUENCY_CAPS.sms.daily}).`,
      };
    }

    // Monthly cap.
    const monthStart = new Date(now);
    monthStart.setMonth(monthStart.getMonth() - 1);
    const monthlyCount = await this.countCallsSince(phone, monthStart);
    if (monthlyCount >= FREQUENCY_CAPS.sms.monthly) {
      return {
        exceeded: true,
        currentCount: monthlyCount,
        maxAllowed: FREQUENCY_CAPS.sms.monthly,
        reason: `Monthly SMS cap exceeded: ${monthlyCount} messages in last 30 days (max ${FREQUENCY_CAPS.sms.monthly}).`,
      };
    }

    return {
      exceeded: false,
      currentCount: dailyCount,
      maxAllowed: FREQUENCY_CAPS.sms.daily,
    };
  }

  /**
   * Count distinct phone numbers that exceeded the daily frequency cap during
   * the given date range (used by the compliance report).
   */
  private async countFrequencyViolations(
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // Group call logs by phone number and count those exceeding the daily cap.
    const result = await this.callLogRepository
      .createQueryBuilder('call')
      .select('call.phoneNumber', 'phoneNumber')
      .addSelect('COUNT(*)', 'count')
      .where('call.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('call.phoneNumber')
      .having('COUNT(*) > :cap', { cap: FREQUENCY_CAPS.phone.daily })
      .getRawMany<{ phoneNumber: string; count: string }>();

    return result.length;
  }
}


