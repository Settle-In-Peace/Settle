import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DialerCallStatus,
  DialerDirection,
  DialerProvider,
  NormalizedWebhookEvent,
} from './dialer-provider.interface';
import { DialerCall } from './dialer-call.entity';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog, ConsentType } from '../entities/consent-log.entity';
import { DebtorProfile } from '../entities/debtor-profile.entity';
import {
  TelnyxDialerProvider,
  TelnyxNotConfiguredError,
  TelnyxUpstreamError,
} from './providers/telnyx-dialer.provider';
import {
  VicidialProvider,
  VicidialNotConfiguredError,
  VicidialUpstreamError,
} from './providers/vicidial.provider';
import { PlaceCallDto } from './dto/place-call.dto';

const E164_RE = /^\+[1-9]\d{6,14}$/;

@Injectable()
export class DialerService {
  private readonly logger = new Logger(DialerService.name);
  private readonly providers: Map<string, DialerProvider>;

  constructor(
    private readonly config: ConfigService,
    private readonly telnyxProvider: TelnyxDialerProvider,
    private readonly vicidialProvider: VicidialProvider,
    @InjectRepository(DialerCall)
    private readonly dialerCallsRepository: Repository<DialerCall>,
    @InjectRepository(DncEntry)
    private readonly dncRepository: Repository<DncEntry>,
    @InjectRepository(ConsentLog)
    private readonly consentRepository: Repository<ConsentLog>,
    @InjectRepository(DebtorProfile)
    private readonly debtorProfilesRepository: Repository<DebtorProfile>,
  ) {
    this.providers = new Map<string, DialerProvider>([
      ['telnyx', telnyxProvider],
      ['vicidial', vicidialProvider],
    ]);
  }

  /** Active provider — selected by DIALER_PROVIDER (default 'vicidial', the free/self-hosted option; 'telnyx' is paid). */
  private getProvider(name?: string): DialerProvider {
    const providerName =
      name ?? this.config.get<string>('DIALER_PROVIDER', 'vicidial');
    const provider = this.providers.get(providerName);
    if (!provider) throw new BadRequestException(`Unknown dialer provider: ${providerName}`);
    return provider;
  }

  // ── TCPA guardrails ────────────────────────────────────────────────────

  /**
   * Normalize to E.164. Same convention as ComplianceService#normalizeE164 —
   * strips separators, assumes NANP (+1) for 10-digit input.
   */
  normalizeE164(phone: string): string {
    if (!phone) return phone;
    let trimmed = phone.trim().replace(/[\s().-]/g, '');
    if (!trimmed.startsWith('+')) {
      if (/^1\d{10}$/.test(trimmed)) {
        trimmed = '+' + trimmed;
      } else if (/^\d{10}$/.test(trimmed)) {
        trimmed = '+1' + trimmed;
      } else {
        trimmed = '+' + trimmed;
      }
    }
    return trimmed;
  }

  private async assertDialable(
    normalizedPhone: string,
    dto: PlaceCallDto,
  ): Promise<{ consentOnFile: boolean }> {
    // 1. E.164 validity — never let a malformed number reach the provider.
    if (!E164_RE.test(normalizedPhone)) {
      throw new BadRequestException(
        `Invalid destination number "${dto.to}" — must normalize to E.164.`,
      );
    }

    // 2. DNC registry — always blocks, regardless of dial mode.
    const dnc = await this.dncRepository.findOne({
      where: { phoneNumber: normalizedPhone },
    });
    if (dnc) {
      throw new ForbiddenException(
        `Number ${normalizedPhone} is on the Do-Not-Call list (source: ${dnc.source ?? 'internal'}). Call blocked.`,
      );
    }

    // 3. Debtor-level do-not-call flag on the linked contact's profile.
    if (dto.contactId) {
      const profile = await this.debtorProfilesRepository.findOne({
        where: { crmClientId: dto.contactId },
      });
      if (profile?.doNotCall) {
        throw new ForbiddenException(
          `Contact ${dto.contactId} is flagged do-not-call. Call blocked.`,
        );
      }
    }

    // 4. Consent — autodial semantics (manualDial=false) require confirmed
    //    consent: either an unexpired TCPA consent log for this number/contact
    //    or an explicit agent attestation (consentConfirmed).
    const consentOnFile = await this.hasCallConsent(normalizedPhone, dto.contactId);
    if (!dto.manualDial && !dto.consentConfirmed && !consentOnFile) {
      throw new ForbiddenException(
        'Autodial calls require confirmed TCPA consent (consentConfirmed=true or a stored consent record). Call blocked.',
      );
    }

    return { consentOnFile };
  }

  /** Look up the most recent granted TCPA consent for this phone/contact. */
  private async hasCallConsent(
    normalizedPhone: string,
    contactId?: string,
  ): Promise<boolean> {
    const rows = await this.consentRepository.find({
      where: [
        { phoneNumber: normalizedPhone, consentType: ConsentType.TCPA, granted: true },
        ...(contactId
          ? [{ clientId: contactId, consentType: ConsentType.TCPA, granted: true }]
          : []),
      ],
      order: { consentTimestamp: 'DESC' },
      take: 1,
    });
    const consent = rows[0];
    if (!consent) return false;
    // TCPA best practice: consent expires after 12 months.
    if (consent.expiresAt && consent.expiresAt.getTime() < Date.now()) {
      return false;
    }
    const capturedAt = consent.consentTimestamp?.getTime();
    if (capturedAt && Date.now() - capturedAt > 365 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  }

  // ── Call lifecycle ─────────────────────────────────────────────────────

  async placeCall(dto: PlaceCallDto, agentId: string): Promise<DialerCall> {
    const provider = this.getProvider();
    const normalizedTo = this.normalizeE164(dto.to);
    const manualDial = dto.manualDial ?? true;
    const consentConfirmed = dto.consentConfirmed ?? false;

    const { consentOnFile } = await this.assertDialable(normalizedTo, {
      ...dto,
      manualDial,
      consentConfirmed,
    });

    // Fail closed with 503 when the provider isn't configured.
    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        `Dialer provider "${provider.name}" is not configured on the API.`,
      );
    }

    // Persist first so client_state can carry the dialer_calls id.
    const call = this.dialerCallsRepository.create({
      contactId: dto.contactId,
      debtId: dto.debtId,
      collectionAccountId: dto.collectionAccountId,
      agentId,
      phoneNumber: normalizedTo,
      fromNumber: dto.from,
      direction: DialerDirection.OUTBOUND,
      status: DialerCallStatus.QUEUED,
      provider: provider.name,
      manualDial,
      consentConfirmed: consentConfirmed || consentOnFile,
      consentMethod: consentOnFile ? 'stored' : consentConfirmed ? 'agent_attested' : undefined,
      notes: dto.notes,
    });
    const saved = await this.dialerCallsRepository.save(call);

    try {
      const result = await provider.placeCall({
        to: normalizedTo,
        from: dto.from,
        consentConfirmed: saved.consentConfirmed,
        manualDial,
        contactId: dto.contactId,
        debtId: dto.debtId,
        collectionAccountId: dto.collectionAccountId,
        clientState: {
          dialerCallId: saved.id,
          contactId: dto.contactId,
          collectionAccountId: dto.collectionAccountId,
        },
        agentExtension: dto.agentExtension,
      });

      saved.providerCallId = result.providerCallId;
      saved.status = result.status;
      saved.rawResponse = result.rawResponse;
      saved.startedAt = new Date();
    } catch (err) {
      saved.status = DialerCallStatus.FAILED;
      saved.rawResponse = { error: (err as Error).message };
      await this.dialerCallsRepository.save(saved);

      if (
        err instanceof TelnyxNotConfiguredError ||
        err instanceof VicidialNotConfiguredError
      ) {
        throw new ServiceUnavailableException(err.message);
      }
      if (
        err instanceof TelnyxUpstreamError ||
        err instanceof VicidialUpstreamError
      ) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }

    const persisted = await this.dialerCallsRepository.save(saved);
    this.logger.log(
      `Dialer call ${persisted.id} placed via ${provider.name} ` +
        `(manualDial=${manualDial}, consentConfirmed=${persisted.consentConfirmed})`,
    );
    return persisted;
  }

  async hangup(callId: string): Promise<DialerCall> {
    const call = await this.getCall(callId);
    if (!call.providerCallId) {
      throw new BadRequestException('Call has no provider call id');
    }
    const provider = this.getProvider(call.provider);
    try {
      await provider.hangup(call.providerCallId);
    } catch (err) {
      if (
        err instanceof TelnyxNotConfiguredError ||
        err instanceof VicidialNotConfiguredError
      ) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
    call.status = DialerCallStatus.CANCELLED;
    call.endedAt = new Date();
    return this.dialerCallsRepository.save(call);
  }

  async listCalls(filter: {
    contactId?: string;
    debtId?: string;
    collectionAccountId?: string;
    agentId?: string;
  }): Promise<DialerCall[]> {
    const where: Record<string, string> = {};
    if (filter.contactId) where.contactId = filter.contactId;
    if (filter.debtId) where.debtId = filter.debtId;
    if (filter.collectionAccountId)
      where.collectionAccountId = filter.collectionAccountId;
    if (filter.agentId) where.agentId = filter.agentId;
    return this.dialerCallsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getCall(id: string): Promise<DialerCall> {
    const call = await this.dialerCallsRepository.findOne({ where: { id } });
    if (!call) throw new NotFoundException(`Dialer call ${id} not found`);
    return call;
  }

  // ── Webhook ingest ─────────────────────────────────────────────────────

  /**
   * Apply a normalized provider event to the matching dialer_calls row.
   * Matches by provider_call_id first, then by client_state.dialerCallId.
   */
  async applyWebhookEvent(
    providerName: string,
    event: NormalizedWebhookEvent,
  ): Promise<void> {
    let call: DialerCall | null = null;
    if (event.providerCallId) {
      call = await this.dialerCallsRepository.findOne({
        where: { providerCallId: event.providerCallId },
      });
    }
    const dialerCallId = event.clientState?.dialerCallId;
    if (!call && typeof dialerCallId === 'string') {
      call = await this.dialerCallsRepository.findOne({
        where: { id: dialerCallId },
      });
    }
    if (!call) {
      this.logger.warn(
        `Dialer webhook (${providerName}/${event.kind}) matched no call — providerCallId=${event.providerCallId ?? 'n/a'}`,
      );
      return;
    }

    if (event.status) call.status = event.status;
    if (event.kind === 'answered' && !call.answeredAt) {
      call.answeredAt = event.occurredAt ?? new Date();
    }
    if (event.kind === 'hangup' || event.kind === 'failed' || event.kind === 'rejected') {
      call.endedAt = event.occurredAt ?? new Date();
      if (event.durationSeconds != null) call.duration = event.durationSeconds;
      if (call.answeredAt) {
        call.duration = Math.max(
          0,
          Math.round((call.endedAt.getTime() - call.answeredAt.getTime()) / 1000),
        );
      }
    }
    if (event.hangupCause) call.hangupCause = event.hangupCause;
    if (event.recordingUrl) call.recordingUrl = event.recordingUrl;
    call.rawResponse = {
      ...(call.rawResponse ?? {}),
      lastWebhook: event.raw,
      lastWebhookAt: new Date().toISOString(),
    };
    await this.dialerCallsRepository.save(call);
    this.logger.log(
      `Dialer call ${call.id} updated by ${providerName} webhook (${event.kind} → ${call.status})`,
    );
  }

  // ── Status / health ────────────────────────────────────────────────────

  /**
   * Config status — does NOT call upstream, safe for UI hints.
   * Lets the web app show a "set up credentials" state when no provider
   * env vars are present.
   */
  getStatus(): {
    activeProvider: string;
    providers: { name: string; configured: boolean }[];
  } {
    const activeProvider = this.config.get<string>('DIALER_PROVIDER', 'vicidial');
    return {
      activeProvider,
      providers: Array.from(this.providers.values()).map((p) => ({
        name: p.name,
        configured: p.isConfigured(),
      })),
    };
  }
}
