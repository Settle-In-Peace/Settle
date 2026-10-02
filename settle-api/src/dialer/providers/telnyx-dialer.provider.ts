import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  DialerCallStatus,
  DialerProvider,
  NormalizedWebhookEvent,
  PlaceCallRequest,
  PlaceCallResult,
  ProviderCallStatusResult,
} from '../dialer-provider.interface';

/** Thrown when Telnyx dialer credentials are missing. Maps to HTTP 503 upstream. */
export class TelnyxNotConfiguredError extends Error {
  constructor() {
    super(
      'Telnyx dialer is not configured. Set TELNYX_API_KEY, TELNYX_FROM_NUMBER and TELNYX_CONNECTION_ID.',
    );
    this.name = 'TelnyxNotConfiguredError';
  }
}

/** Thrown for upstream Telnyx failures. */
export class TelnyxUpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'TelnyxUpstreamError';
  }
}

/**
 * Telnyx Call Control dialer provider.
 *
 * Env (reuses the existing Telnyx env block):
 *   TELNYX_API_KEY        — v2 API key (Bearer)
 *   TELNYX_FROM_NUMBER    — outbound caller ID (E.164)
 *   TELNYX_CONNECTION_ID  — Call Control application/connection ID
 *   TELNYX_PUBLIC_KEY     — Ed25519 public key for webhook signature checks
 *   TELNYX_CALL_WEBHOOK_URL — optional override for the per-call webhook_url
 *                             (defaults to PUBLIC_API_URL + /dialer/webhooks/telnyx
 *                             when PUBLIC_API_URL is set)
 *
 * Correlation: every originate call sends `client_state` = base64(JSON) with
 * { dialerCallId, contactId, … } — Telnyx echoes it back on every call event,
 * so webhooks can be matched even before provider_call_id is persisted.
 *
 * Recording: Telnyx Call Control does not auto-record on dial; enable
 * "record from answer" on the Call Control app in the portal, or issue a
 * record_start command. `call.recording_saved` webhooks carry the mp3 URL.
 *
 * Security: the API key is NEVER logged. Log lines include method + path +
 * upstream status only.
 */
@Injectable()
export class TelnyxDialerProvider implements DialerProvider {
  readonly name = 'telnyx';
  private readonly logger = new Logger(TelnyxDialerProvider.name);

  constructor(private readonly config: ConfigService) {}

  // ── Configuration ──────────────────────────────────────────────────────

  private get apiKey(): string {
    return this.config.get<string>('TELNYX_API_KEY', '');
  }

  private get fromNumber(): string {
    return this.config.get<string>('TELNYX_FROM_NUMBER', '');
  }

  private get connectionId(): string {
    return this.config.get<string>('TELNYX_CONNECTION_ID', '');
  }

  private get baseUrl(): string {
    return this.config
      .get<string>('TELNYX_API_BASE_URL', 'https://api.telnyx.com/v2')
      .replace(/\/$/, '');
  }

  private get timeoutMs(): number {
    return this.config.get<number>('TELNYX_TIMEOUT_MS', 15_000);
  }

  private get webhookUrl(): string | undefined {
    const explicit = this.config.get<string>('TELNYX_CALL_WEBHOOK_URL', '');
    if (explicit) return explicit;
    const publicApi = this.config.get<string>('PUBLIC_API_URL', '');
    return publicApi
      ? `${publicApi.replace(/\/$/, '')}/dialer/webhooks/telnyx`
      : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.fromNumber && this.connectionId);
  }

  // ── HTTP plumbing (hard timeout, fail-closed on 4xx) ───────────────────

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const method = init.method ?? 'GET';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new TelnyxUpstreamError(
        `Telnyx unreachable: ${isTimeout ? 'timeout' : (err as Error).message}`,
      );
    }
    clearTimeout(timer);

    if (!res.ok) {
      const body = await this.safeBody(res);
      throw new TelnyxUpstreamError(
        `Telnyx ${method} ${path} failed (${res.status}): ${body}`,
        res.status,
      );
    }
    return res;
  }

  private async safeBody(res: Response): Promise<string> {
    try {
      const text = await res.text();
      return text.slice(0, 300);
    } catch {
      return '(unreadable body)';
    }
  }

  // ── DialerProvider ─────────────────────────────────────────────────────

  async placeCall(req: PlaceCallRequest): Promise<PlaceCallResult> {
    if (!this.isConfigured()) throw new TelnyxNotConfiguredError();

    this.logger.log(`Originating ${req.manualDial ? 'manual' : 'auto'} call`);

    // client_state rides on every subsequent webhook event for this call.
    const clientState = Buffer.from(
      JSON.stringify({
        ...(req.clientState ?? {}),
        manualDial: req.manualDial,
        consentConfirmed: req.consentConfirmed,
      }),
    ).toString('base64');

    const body: Record<string, any> = {
      connection_id: this.connectionId,
      to: req.to,
      from: req.from || this.fromNumber,
      client_state: clientState,
    };
    if (this.webhookUrl) body.webhook_url = this.webhookUrl;

    const res = await this.request('/calls', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, any>;
    const callControlId = data?.data?.call_control_id;

    return {
      providerCallId: callControlId,
      status: DialerCallStatus.DIALING,
      rawResponse: data,
    };
  }

  async hangup(providerCallId: string): Promise<void> {
    if (!this.isConfigured()) throw new TelnyxNotConfiguredError();
    await this.request(`/calls/${providerCallId}/actions/hangup`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    this.logger.log(`Hangup issued for ${providerCallId}`);
  }

  /**
   * Live status lookup. NOTE: Telnyx Call Control is event-driven and does
   * not document a stable "get call" endpoint for post-origination state —
   * the webhook-updated dialer_calls row is the source of truth. This is a
   * best-effort call to GET /calls/{id} and is marked TODO(telnyx-api):
   * verify the endpoint against the account before relying on it.
   */
  async callStatus(providerCallId: string): Promise<ProviderCallStatusResult> {
    if (!this.isConfigured()) throw new TelnyxNotConfiguredError();
    try {
      const res = await this.request(`/calls/${providerCallId}`);
      const data = (await res.json()) as Record<string, any>;
      return {
        status: this.mapProviderStatus(data?.data?.call_state ?? ''),
        providerStatus: data?.data?.call_state,
        durationSeconds: data?.data?.duration_seconds,
        rawResponse: data,
      };
    } catch (err) {
      this.logger.warn(
        `callStatus lookup failed for ${providerCallId}: ${(err as Error).message} (endpoint may not exist — rely on webhooks)`,
      );
      return { status: DialerCallStatus.DIALING };
    }
  }

  /**
   * Recording lookup via GET /v2/recordings filtered by call leg.
   * TODO(telnyx-api): confirm the filter name against the account — the
   * `call.recording_saved` webhook path is the reliable source.
   */
  async recordingUrl(providerCallId: string): Promise<string | null> {
    if (!this.isConfigured()) throw new TelnyxNotConfiguredError();
    try {
      const res = await this.request(
        `/recordings?filter[call_leg_id]=${encodeURIComponent(providerCallId)}`,
      );
      const data = (await res.json()) as Record<string, any>;
      const rec = data?.data?.[0];
      return (
        rec?.download_urls?.mp3 ??
        rec?.record?.download_url ??
        rec?.download_url ??
        null
      );
    } catch (err) {
      this.logger.warn(
        `recordings lookup failed for ${providerCallId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────

  /**
   * Normalize a Telnyx webhook envelope into a provider-neutral event.
   * Expects the standard { data: { event_type, payload } } shape.
   */
  ingestWebhook(body: Record<string, any>): NormalizedWebhookEvent | null {
    const data = body?.data;
    if (!data || typeof data !== 'object') return null;
    const eventType = data.event_type ?? 'unknown';
    const payload = (data.payload ?? {}) as Record<string, any>;

    const clientState = this.decodeClientState(payload.client_state);
    const base: NormalizedWebhookEvent = {
      providerCallId: payload.call_control_id,
      kind: 'unknown',
      occurredAt: data.occurred_at ? new Date(data.occurred_at) : undefined,
      clientState,
      raw: body,
    };

    switch (eventType) {
      case 'call.initiated':
        return { ...base, kind: 'initiated', status: DialerCallStatus.DIALING };
      case 'call.answered':
        return { ...base, kind: 'answered', status: DialerCallStatus.ANSWERED };
      case 'call.hangup': {
        const hangupCause = payload.hangup_cause || payload.cause;
        const wasAnswered = Boolean(payload.start_time && payload.hangup_source !== undefined)
          ? true
          : clientState?.answered === true;
        return {
          ...base,
          kind: 'hangup',
          status: this.mapHangupCause(hangupCause, wasAnswered),
          hangupCause,
          durationSeconds:
            payload.call_duration_secs ?? payload.duration_seconds,
        };
      }
      case 'call.recording_saved':
      case 'call.recording_ended': {
        const recordingUrl =
          payload.recording_urls?.mp3 ??
          payload.recording_url ??
          payload.public_recording_url;
        return {
          ...base,
          kind: 'recording_saved',
          recordingUrl,
        };
      }
      case 'call.rejected':
      case 'call.machine.detection.ended':
        return { ...base, kind: 'rejected', status: DialerCallStatus.FAILED };
      default:
        return { ...base, kind: 'unknown' };
    }
  }

  /**
   * Verify the Telnyx Ed25519 webhook signature.
   *
   * Mirrors the verification in src/telnyx/telnyx-webhook.service.ts —
   * reimplemented here so the dialer module stays self-contained (the
   * telnyx-webhook module is owned by another track).
   *
   * Fail-closed in production: missing TELNYX_PUBLIC_KEY or missing headers
   * rejects the event. In non-production a missing public key skips
   * verification so local dev is not blocked.
   */
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const publicKey = this.config.get<string>('TELNYX_PUBLIC_KEY', '');
    const isProduction = process.env.NODE_ENV === 'production';
    const header = (name: string): string | undefined => {
      const value = headers[name] ?? headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };
    const signatureHeader = header('telnyx-signature-ed25519');
    const timestampHeader = header('telnyx-timestamp-ed25519');

    if (!signatureHeader || !timestampHeader) {
      this.logger.error('Telnyx webhook rejected — signature/timestamp header missing.');
      return false;
    }

    if (!publicKey) {
      if (isProduction) {
        this.logger.error(
          'Telnyx webhook rejected — TELNYX_PUBLIC_KEY is not configured in production.',
        );
        return false;
      }
      this.logger.warn(
        'Telnyx signature verification skipped — TELNYX_PUBLIC_KEY not set (non-production).',
      );
      return true;
    }

    const timestampSeconds = Number(timestampHeader);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > 300
    ) {
      this.logger.error('Telnyx webhook rejected — timestamp stale or malformed.');
      return false;
    }

    try {
      const keyObject = this.buildEd25519PublicKey(publicKey);
      const isValid = crypto.verify(
        null,
        Buffer.from(`${timestampHeader}|${rawBody}`, 'utf8'),
        keyObject,
        Buffer.from(signatureHeader, 'base64'),
      );
      if (!isValid) {
        this.logger.error('Telnyx webhook signature verification FAILED.');
      }
      return isValid;
    } catch (err) {
      this.logger.error(
        `Telnyx webhook signature verification error: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async healthCheck(): Promise<boolean> {
    // No cheap authenticated ping on Call Control — "configured" is the check.
    return this.isConfigured();
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Build an Ed25519 KeyObject from a PEM string or the raw base64 32-byte key. */
  private buildEd25519PublicKey(publicKey: string): crypto.KeyObject {
    if (publicKey.includes('BEGIN')) {
      return crypto.createPublicKey(publicKey);
    }
    const keyBytes = Buffer.from(publicKey, 'base64');
    if (keyBytes.length !== 32) {
      throw new Error('TELNYX_PUBLIC_KEY must be a PEM or a 32-byte base64 Ed25519 key');
    }
    // Ed25519 SPKI DER prefix: SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING }
    const spkiDer = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      keyBytes,
    ]);
    return crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
  }

  private decodeClientState(
    clientState: unknown,
  ): Record<string, unknown> | undefined {
    if (!clientState || typeof clientState !== 'string') return undefined;
    try {
      const decoded = Buffer.from(clientState, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private mapProviderStatus(providerStatus: string): DialerCallStatus {
    switch (providerStatus) {
      case 'answered':
      case 'bridged':
        return DialerCallStatus.ANSWERED;
      case 'hangup':
        return DialerCallStatus.COMPLETED;
      case 'ringing':
        return DialerCallStatus.RINGING;
      default:
        return DialerCallStatus.DIALING;
    }
  }

  private mapHangupCause(
    cause: string | undefined,
    wasAnswered: boolean,
  ): DialerCallStatus {
    if (wasAnswered) return DialerCallStatus.COMPLETED;
    switch (cause) {
      case 'busy':
      case 'caller-busy':
      case 'user_busy':
        return DialerCallStatus.BUSY;
      case 'no_answer':
      case 'no-answer':
      case 'timeout':
      case 'no_user_response':
        return DialerCallStatus.NO_ANSWER;
      case 'normal_clearing':
      case 'originator_cancel':
        return wasAnswered ? DialerCallStatus.COMPLETED : DialerCallStatus.NO_ANSWER;
      default:
        return wasAnswered ? DialerCallStatus.COMPLETED : DialerCallStatus.FAILED;
    }
  }
}
