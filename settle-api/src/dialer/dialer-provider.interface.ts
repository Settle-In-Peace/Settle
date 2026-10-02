/**
 * Provider-neutral dialer interface.
 * Each telephony/dialer backend (Telnyx Call Control, ViciDial Non-Agent API,
 * future providers) implements this. Mirrors the CreditProvider pattern used
 * by src/credit-bureau — env-gated configuration with a fail-closed
 * isConfigured() check.
 */

/** Normalized call lifecycle used by the dialer_calls table. */
export enum DialerCallStatus {
  QUEUED = 'queued',
  DIALING = 'dialing',
  RINGING = 'ringing',
  ANSWERED = 'answered',
  COMPLETED = 'completed',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  FAILED = 'failed',
  VOICEMAIL = 'voicemail',
  CANCELLED = 'cancelled',
}

export enum DialerDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export interface PlaceCallRequest {
  /** Destination number — MUST already be normalized to E.164 by the service layer. */
  to: string;
  /** Caller ID (defaults to the provider's configured from-number). */
  from?: string;
  /**
   * TCPA: the agent attests that prior express consent to call is on file.
   * Always recorded on the call row for audit.
   */
  consentConfirmed: boolean;
  /**
   * TCPA: true = human-initiated click-to-call (manual dial, no autodialer
   * semantics); false = autodial/preview-dial semantics and requires consent.
   */
  manualDial: boolean;
  /** Internal links — stored on the call record, forwarded via client state. */
  contactId?: string;
  debtId?: string;
  collectionAccountId?: string;
  /** Correlates webhook events back to our dialer_calls row. */
  clientState?: Record<string, unknown>;
  /** ViciDial: the logged-in agent extension that owns the origination. */
  agentExtension?: string;
  /** Optional freeform context (recorded, never required by providers). */
  notes?: string;
}

export interface PlaceCallResult {
  /** Provider-side call identifier (Telnyx call_control_id, ViciDial channel, …) */
  providerCallId?: string;
  status: DialerCallStatus;
  rawResponse?: Record<string, any>;
}

export interface ProviderCallStatusResult {
  status: DialerCallStatus;
  /** Provider-native status string, for diagnostics. */
  providerStatus?: string;
  durationSeconds?: number;
  rawResponse?: Record<string, any>;
}

export type DialerWebhookKind =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'hangup'
  | 'recording_saved'
  | 'failed'
  | 'rejected'
  | 'unknown';

export interface NormalizedWebhookEvent {
  providerCallId?: string;
  kind: DialerWebhookKind;
  status?: DialerCallStatus;
  durationSeconds?: number;
  recordingUrl?: string;
  hangupCause?: string;
  occurredAt?: Date;
  /** Decoded client_state echoed back by the provider, if any. */
  clientState?: Record<string, unknown>;
  raw: Record<string, any>;
}

export interface DialerProvider {
  /** Provider identifier, e.g. 'telnyx', 'vicidial'. */
  readonly name: string;

  /** Whether required env credentials are present (fail-closed check). */
  isConfigured(): boolean;

  /** Originate an outbound call. */
  placeCall(req: PlaceCallRequest): Promise<PlaceCallResult>;

  /** Hang up an in-progress call by provider call ID. */
  hangup(providerCallId: string): Promise<void>;

  /** Best-effort live status lookup against the provider API. */
  callStatus(providerCallId: string): Promise<ProviderCallStatusResult>;

  /** Best-effort recording URL lookup against the provider API. */
  recordingUrl(providerCallId: string): Promise<string | null>;

  /**
   * Parse a raw webhook body into a normalized event. Returns null when the
   * provider has no webhook story for this module (e.g. ViciDial, which is
   * polled instead).
   */
  ingestWebhook(body: Record<string, any>): NormalizedWebhookEvent | null;

  /**
   * Verify the authenticity of an inbound webhook request. Providers without
   * signed webhooks may omit this — the controller will reject the request.
   */
  verifyWebhookSignature?(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean;

  /** Health check — verify credentials reach the provider. */
  healthCheck?(): Promise<boolean>;
}
