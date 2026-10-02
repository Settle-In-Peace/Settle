/**
 * Provider-neutral payment processor interface for HIGH-RISK transactions
 * (debt collection is a high-risk MCC — Stripe will not board it, so these
 * adapters sit alongside, not inside, src/stripe/ which stays for mainstream
 * subscriptions and lead purchases).
 *
 * PCI posture:
 *   - This API NEVER accepts raw PAN/CVV. Charges take a single-use processor
 *     token (NMI Collect.js `payment_token`, Authorize.Net Accept.js
 *     `opaqueData.dataValue`, Stripe PaymentMethod id) or a stored
 *     customer-vault id.
 *   - `hostedFieldsConfig()` returns the client-side descriptor (script URL +
 *     public tokenization key) the web UI mounts so card data goes straight
 *     from the debtor's browser to the processor.
 *   - We persist card_brand/card_last4 ONLY — never PAN, expiry, or CVV.
 */

export type ProcessorName = 'nmi' | 'authorizenet' | 'stripe';

export type ProcessorPaymentStatus =
  | 'approved'
  | 'declined'
  | 'voided'
  | 'refunded'
  | 'error';

/** Charge input. NOTE: there is intentionally no card number / cvv field. */
export interface ProcessorChargeRequest {
  /** Amount in whole cents (never floats). */
  amountCents: number;
  /** ISO currency, default 'usd'. */
  currency?: string;
  /**
   * Processor token: NMI Collect.js payment_token, AuthNet Accept.js
   * opaqueData value, Stripe payment_method id, OR a saved vault id
   * (see `vaultId` — tokens are single-use, vault ids are reusable).
   */
  paymentToken?: string;
  /** Existing customer-vault / payment-method id for card-on-file charges. */
  vaultId?: string;
  orderId?: string;
  description?: string;
  email?: string;
  /** Internal refs for gateway metadata (never PII beyond what vault holds). */
  metadata?: Record<string, string>;
}

export interface ProcessorChargeResult {
  status: Extract<ProcessorPaymentStatus, 'approved' | 'declined' | 'error'>;
  processorTxnId?: string;
  authCode?: string;
  /** Raw gateway response code/text for audit (NMI response, AuthNet responseCode). */
  responseCode?: string;
  responseText?: string;
  avsResponse?: string;
  cvvResponse?: string;
  cardLast4?: string;
  cardBrand?: string;
  /** Vault id if the processor created/echoed a customer vault record. */
  vaultId?: string;
  /** Sanitized raw gateway response (PAN-bearing keys stripped). */
  raw?: Record<string, any>;
}

export interface ProcessorRefundRequest {
  processorTxnId: string;
  /** Omit for full refund. */
  amountCents?: number;
  /** AuthNet refunds need the last4 of the original card. */
  cardLast4?: string;
  reason?: string;
}

export interface ProcessorVoidRequest {
  processorTxnId: string;
}

export interface RecurringPlanRequest {
  /** Token or vault id the plan bills against. */
  paymentToken?: string;
  vaultId?: string;
  amountCents: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  /** ISO date (YYYY-MM-DD) of the first recurring charge. */
  startDate: string;
  /** Total number of payments; omit for open-ended. */
  numberOfPayments?: number;
  orderId?: string;
  description?: string;
}

export interface RecurringPlanResult {
  /** Processor-side subscription/plan id. */
  planId: string;
  /** Vault/customer id created or used. */
  vaultId?: string;
  raw?: Record<string, any>;
}

/** Client-side hosted-field/tokenization descriptor (public values only). */
export interface HostedFieldsConfig {
  /** 'collectjs' (NMI) | 'acceptjs' (AuthNet) | 'stripejs' */
  kind: string;
  scriptUrl: string;
  /** Public tokenization key — safe to expose to the browser by design. */
  tokenizationKey?: string;
  /** AuthNet Accept.js also needs the public client key + login id. */
  clientKey?: string;
  apiLoginId?: string;
  variant?: 'inline' | 'lightbox' | 'redirect';
}

export interface ProcessorWebhookEvent {
  /** Normalized event type, e.g. 'sale.approved', 'refund.approved'. */
  eventType: string;
  processorTxnId?: string;
  status?: ProcessorPaymentStatus | 'unknown';
  amountCents?: number;
  /** Provider event id for dedupe. */
  eventId?: string;
  raw?: Record<string, any>;
}

/**
 * Thrown when required env vars are absent. Maps to HTTP 503 upstream —
 * callers see "processor not configured", never a half-run charge.
 */
export class ProcessorNotConfiguredError extends Error {
  constructor(public readonly processor: string, hint?: string) {
    super(
      `Payment processor "${processor}" is not configured.` +
        (hint ? ` ${hint}` : ''),
    );
    this.name = 'ProcessorNotConfiguredError';
  }
}

/**
 * Transient upstream failure — network error, timeout, or HTTP 5xx from the
 * gateway. This is the ONLY error class the router may fail over on. A
 * declined card (or a deterministic gateway-level rejection) is a RESULT,
 * not an exception, and must never be retried or replayed against another
 * processor.
 */
export class ProcessorUpstreamError extends Error {
  constructor(
    public readonly processor: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`${processor}: ${message}`);
    this.name = 'ProcessorUpstreamError';
  }
}

/** Webhook signature/shared-secret verification failed. Maps to HTTP 401. */
export class WebhookVerificationError extends Error {
  constructor(public readonly processor: string, message = 'signature verification failed') {
    super(`${processor}: ${message}`);
    this.name = 'WebhookVerificationError';
  }
}

export interface PaymentProcessorProvider {
  readonly name: ProcessorName;

  /** Whether required credentials are present (fail-closed check). */
  isConfigured(): boolean;

  /** Hosted-fields descriptor for the web UI. Throws if not configured. */
  hostedFieldsConfig(): HostedFieldsConfig;

  charge(req: ProcessorChargeRequest): Promise<ProcessorChargeResult>;
  refund(req: ProcessorRefundRequest): Promise<ProcessorChargeResult>;
  void(req: ProcessorVoidRequest): Promise<ProcessorChargeResult>;

  createRecurringPlan(req: RecurringPlanRequest): Promise<RecurringPlanResult>;
  chargeRecurring(
    planId: string,
    amountCents: number,
  ): Promise<ProcessorChargeResult>;

  /**
   * Verify an inbound webhook's signature/shared secret against the RAW body.
   * Throws WebhookVerificationError on mismatch, ProcessorNotConfiguredError
   * when no secret is configured (fail-closed).
   */
  verifyWebhook(rawBody: Buffer | string, signatureHeader?: string): void;

  /** Parse a verified webhook body into a normalized event. */
  parseWebhook(rawBody: Buffer | string): ProcessorWebhookEvent;
}
