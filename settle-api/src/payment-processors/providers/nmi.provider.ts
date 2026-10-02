import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HostedFieldsConfig,
  PaymentProcessorProvider,
  ProcessorChargeRequest,
  ProcessorChargeResult,
  ProcessorNotConfiguredError,
  ProcessorRefundRequest,
  ProcessorUpstreamError,
  ProcessorVoidRequest,
  ProcessorWebhookEvent,
  RecurringPlanRequest,
  RecurringPlanResult,
  WebhookVerificationError,
} from '../payment-processor.interface';
import {
  centsToAmount,
  hmacSha256Hex,
  safeEqual,
} from '../payment-processor.utils';

/**
 * NMI (Network Merchants Inc) provider — the standard gateway behind most
 * high-risk / debt-collection merchant accounts.
 *
 * API (Payment API / Direct Post):
 *   POST {base}/api/transact.php — application/x-www-form-urlencoded
 *     sandbox:    https://sandbox.nmi.com   (test merchant accounts)
 *     production: https://secure.nmi.com
 *   Auth: `security_key` (merchant portal → Settings → Security Keys).
 *   Response is form-urlencoded: response=1 approved | 2 declined | 3 error,
 *   plus responsetext, authcode, transactionid, avsresponse, cvvresponse.
 *
 * Tokenization (PCI posture — PAN never touches this server):
 *   Collect.js hosted fields, loaded from {base}/token/Collect.js with the
 *   PUBLIC tokenization key (NMI_PUBLIC_KEY). It posts a single-use
 *   `payment_token` which we submit as the `payment_token` variable.
 *
 * Recurring: Customer Vault (`customer_vault=add_customer`) then a recurring
 *   subscription (`recurring=add_subscription` with plan_* fields). Vault id
 *   doubles as the reusable credential for chargeRecurring (type=sale +
 *   customer_vault_id).
 *
 * Webhooks: merchant portal → Settings → Webhooks posts JSON
 *   { event_id, event_type, event_body } with header
 *   `Webhook-Signature: t=<nonce>,s=<hmac>` where
 *   s = HMAC-SHA256(NMI_WEBHOOK_SECRET, "<nonce>.<raw body>") hex.
 *   `t` is a NONCE (not a timestamp) — NMI defines no replay window.
 *   Fallback when webhooks aren't enabled: Query API — queryTransaction()
 *   POSTs {base}/api/query.php and parses the XML <condition>/<action>
 *   fields (lightweight regex extraction; no XML dep).
 *
 * SECURITY: the security key is sent in the POST body only; request bodies
 * and gateway responses are never logged verbatim (safeBody truncates).
 */
@Injectable()
export class NmiProvider implements PaymentProcessorProvider {
  readonly name = 'nmi' as const;
  private readonly logger = new Logger(NmiProvider.name);

  constructor(private readonly config: ConfigService) {}

  // ── Configuration ──────────────────────────────────────────────────────

  get environment(): 'sandbox' | 'production' {
    return this.config.get<string>('NMI_ENV', 'sandbox') === 'production'
      ? 'production'
      : 'sandbox';
  }

  private get baseUrl(): string {
    const def =
      this.environment === 'production'
        ? 'https://secure.nmi.com'
        : 'https://sandbox.nmi.com';
    return this.config
      .get<string>('NMI_API_BASE_URL', def)
      .replace(/\/$/, '');
  }

  private get securityKey(): string {
    return this.config.get<string>('NMI_SECURITY_KEY', '');
  }

  /** Collect.js public tokenization key — safe to expose to the browser. */
  get publicKey(): string {
    return this.config.get<string>('NMI_PUBLIC_KEY', '');
  }

  private get webhookSecret(): string {
    return this.config.get<string>('NMI_WEBHOOK_SECRET', '');
  }

  isConfigured(): boolean {
    return Boolean(this.securityKey);
  }

  private get timeoutMs(): number {
    return this.config.get<number>('NMI_TIMEOUT_MS', 15_000);
  }

  /** Retries for transient failures (network error, HTTP 5xx). Never retries a parsed gateway response. */
  private get maxRetries(): number {
    return this.config.get<number>('NMI_MAX_RETRIES', 2);
  }

  // ── HTTP plumbing (timeout + bounded retry, never retry a gateway verdict) ──

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * POST form-urlencoded to the NMI API with a hard timeout and bounded
   * exponential-backoff retries on transport failures and HTTP 5xx only.
   * Once NMI answers with an HTTP 200 the gateway verdict (approved /
   * declined / error) is final — we never re-post it, and the router never
   * fails a declined/error verdict over to another processor.
   */
  private async post(
    path: string,
    params: Record<string, string>,
    attempt = 0,
  ): Promise<URLSearchParams | string> {
    if (!this.isConfigured()) {
      throw new ProcessorNotConfiguredError(
        this.name,
        'Set NMI_SECURITY_KEY (and NMI_PUBLIC_KEY for Collect.js).',
      );
    }

    const url = `${this.baseUrl}${path}`;
    const body = new URLSearchParams({ ...params, security_key: this.securityKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      // NOTE: body contains credentials + single-use token — never log it.
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      if (attempt < this.maxRetries) {
        const backoff = 250 * 2 ** attempt;
        this.logger.warn(
          `POST ${path} network${isTimeout ? ' timeout' : ''} error — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
        );
        await this.sleep(backoff);
        return this.post(path, params, attempt + 1);
      }
      throw new ProcessorUpstreamError(
        this.name,
        `unreachable after ${attempt + 1} attempt(s): ${isTimeout ? 'timeout' : (err as Error).message}`,
      );
    }
    clearTimeout(timer);

    if (res.ok) {
      const text = await res.text();
      return path.endsWith('query.php')
        ? text
        : new URLSearchParams(text);
    }

    if (res.status >= 400 && res.status < 500) {
      // Deterministic rejection — never retry, never fail over.
      const snippet = (await res.text()).slice(0, 200);
      return new URLSearchParams(snippet); // let the caller map it
    }

    // 5xx — retryable
    if (attempt < this.maxRetries) {
      const backoff = 250 * 2 ** attempt;
      this.logger.warn(
        `POST ${path} -> ${res.status} — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
      );
      await this.sleep(backoff);
      return this.post(path, params, attempt + 1);
    }
    throw new ProcessorUpstreamError(
      this.name,
      `POST ${path} failed (${res.status}) after ${attempt + 1} attempt(s)`,
      res.status,
    );
  }

  // ── Response mapping ────────────────────────────────────────────────────

  private mapResult(params: URLSearchParams): ProcessorChargeResult {
    const response = params.get('response') ?? '';
    const base: Omit<ProcessorChargeResult, 'status'> = {
      processorTxnId: params.get('transactionid') ?? undefined,
      authCode: params.get('authcode') ?? undefined,
      responseCode: response || undefined,
      responseText: params.get('responsetext') ?? undefined,
      avsResponse: params.get('avsresponse') ?? undefined,
      cvvResponse: params.get('cvvresponse') ?? undefined,
      vaultId: params.get('customer_vault_id') ?? undefined,
      raw: Object.fromEntries(params.entries()),
    };
    // NMI echoes masked card data in some responses as cc_number/ccexp —
    // sanitizeGatewayResponse() in the service layer strips those keys before
    // persistence. card last4/brand may come via Collect.js receipt fields.
    const last4 = params.get('cc_number')?.replace(/\D/g, '').slice(-4);
    if (last4 && last4.length === 4) base.cardLast4 = last4;
    const cardType = params.get('card_type') ?? params.get('cc_type');
    if (cardType) base.cardBrand = cardType;

    if (response === '1') return { ...base, status: 'approved' };
    if (response === '2') return { ...base, status: 'declined' };
    // response=3 = gateway-level error (bad data, dup, processor down-stream
    // rejection). Deterministic — surfaced as an error result, never retried.
    return { ...base, status: 'error' };
  }

  private merchantFields(meta?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!meta) return out;
    // NMI allows up to merchant_defined_field_1..20
    Object.entries(meta)
      .slice(0, 20)
      .forEach(([, v], i) => {
        out[`merchant_defined_field_${i + 1}`] = String(v).slice(0, 255);
      });
    return out;
  }

  // ── PaymentProcessorProvider ───────────────────────────────────────────

  hostedFieldsConfig(): HostedFieldsConfig {
    if (!this.isConfigured()) {
      throw new ProcessorNotConfiguredError(this.name);
    }
    return {
      kind: 'collectjs',
      // Collect.js is served by the gateway itself — sandbox merchant
      // accounts load it from sandbox.nmi.com.
      scriptUrl: `${this.baseUrl}/token/Collect.js`,
      tokenizationKey: this.publicKey || undefined,
      variant: 'inline',
    };
  }

  async charge(req: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    const params: Record<string, string> = {
      type: 'sale',
      amount: centsToAmount(req.amountCents),
      ...this.merchantFields(req.metadata),
    };
    if (req.vaultId) {
      params.customer_vault_id = req.vaultId;
    } else if (req.paymentToken) {
      params.payment_token = req.paymentToken;
    } else {
      throw new ProcessorUpstreamError(
        this.name,
        'charge requires paymentToken or vaultId',
      );
    }
    if (req.orderId) params.orderid = req.orderId;
    if (req.description) params.order_description = req.description.slice(0, 255);
    if (req.email) params.email = req.email;

    const res = await this.post('/api/transact.php', params);
    return this.mapResult(res as URLSearchParams);
  }

  async refund(req: ProcessorRefundRequest): Promise<ProcessorChargeResult> {
    const params: Record<string, string> = {
      type: 'refund',
      transactionid: req.processorTxnId,
    };
    if (req.amountCents != null) {
      params.amount = centsToAmount(req.amountCents);
    }
    const res = await this.post('/api/transact.php', params);
    return this.mapResult(res as URLSearchParams);
  }

  async void(req: ProcessorVoidRequest): Promise<ProcessorChargeResult> {
    const res = await this.post('/api/transact.php', {
      type: 'void',
      transactionid: req.processorTxnId,
    });
    return this.mapResult(res as URLSearchParams);
  }

  /**
   * Customer Vault add + recurring subscription (recurring=add_subscription).
   * Two gateway calls; the vault id is returned for chargeRecurring.
   */
  async createRecurringPlan(
    req: RecurringPlanRequest,
  ): Promise<RecurringPlanResult> {
    // Step 1: create the vault record from the one-time token (or reuse a vault id).
    let vaultId = req.vaultId;
    if (!vaultId) {
      if (!req.paymentToken) {
        throw new ProcessorUpstreamError(
          this.name,
          'createRecurringPlan requires paymentToken or vaultId',
        );
      }
      const vaultRes = (await this.post('/api/transact.php', {
        customer_vault: 'add_customer',
        payment_token: req.paymentToken,
        ...(req.orderId ? { orderid: req.orderId } : {}),
      })) as URLSearchParams;
      const vault = this.mapResult(vaultRes);
      if (vault.status !== 'approved' || !vault.processorTxnId && !vaultRes.get('customer_vault_id')) {
        return { planId: '', raw: vault.raw };
      }
      vaultId = vaultRes.get('customer_vault_id') ?? undefined;
      if (!vaultId) {
        return { planId: '', raw: vault.raw };
      }
    }

    // Step 2: attach a recurring subscription to the vault record.
    const params: Record<string, string> = {
      recurring: 'add_subscription',
      customer_vault_id: vaultId,
      plan_amount: centsToAmount(req.amountCents),
      start_date: req.startDate.replace(/-/g, ''), // NMI wants YYYYMMDD
    };
    if (req.frequency === 'weekly') {
      params.day_frequency = '7';
    } else if (req.frequency === 'biweekly') {
      params.day_frequency = '14';
    } else {
      params.month_frequency = '1';
      params.day_of_month = String(
        Math.min(28, new Date(req.startDate).getUTCDate()),
      );
    }
    if (req.numberOfPayments != null) {
      params.plan_payments = String(req.numberOfPayments);
    }
    if (req.orderId) params.orderid = req.orderId;
    if (req.description) params.order_description = req.description.slice(0, 255);

    const res = (await this.post('/api/transact.php', params)) as URLSearchParams;
    const mapped = this.mapResult(res);
    return {
      planId:
        res.get('subscription_id') ??
        res.get('recurring_subscription_id') ??
        mapped.processorTxnId ??
        '',
      vaultId,
      raw: mapped.raw,
    };
  }

  /** Charge an existing vault record (card-on-file / subscription billing). */
  async chargeRecurring(
    vaultId: string,
    amountCents: number,
  ): Promise<ProcessorChargeResult> {
    const res = await this.post('/api/transact.php', {
      type: 'sale',
      amount: centsToAmount(amountCents),
      customer_vault_id: vaultId,
      billing_method: 'recurring',
    });
    return this.mapResult(res as URLSearchParams);
  }

  // ── Webhooks ────────────────────────────────────────────────────────────

  /**
   * NMI Webhook-Signature: `t=<nonce>,s=<hex>` where
   * s = HMAC-SHA256(NMI_WEBHOOK_SECRET, "<nonce>.<raw body>").
   * `t` is a NONCE — there is no timestamp, hence no replay window; NMI
   * documents none. Reject anything that doesn't verify (fail-closed).
   */
  verifyWebhook(rawBody: Buffer | string, signatureHeader?: string): void {
    if (!this.webhookSecret) {
      throw new ProcessorNotConfiguredError(
        this.name,
        'NMI_WEBHOOK_SECRET (merchant portal → Settings → Webhooks signing key) is not set.',
      );
    }
    const header = signatureHeader ?? '';
    const match = /t=([^,]*),s=(.*)/.exec(header);
    if (!match) {
      throw new WebhookVerificationError(
        this.name,
        'missing or malformed Webhook-Signature header',
      );
    }
    const [, nonce, signature] = match;
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const expected = hmacSha256Hex(this.webhookSecret, `${nonce}.${bodyStr}`);
    if (!safeEqual(expected, signature)) {
      throw new WebhookVerificationError(this.name);
    }
  }

  parseWebhook(rawBody: Buffer | string): ProcessorWebhookEvent {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    let envelope: any;
    try {
      envelope = JSON.parse(bodyStr);
    } catch {
      throw new WebhookVerificationError(this.name, 'webhook body is not JSON');
    }
    const eventType: string = envelope.event_type ?? '';
    const eb = envelope.event_body ?? {};
    const txn = eb.transaction ?? eb;
    const processorTxnId =
      txn?.transaction_id ?? txn?.transactionid ?? eb?.transaction_id;

    // Map e.g. "transaction.sale.success" → approved; ".failure" → declined.
    let status: ProcessorWebhookEvent['status'] = 'unknown';
    if (eventType.endsWith('.success')) {
      if (eventType.includes('refund')) status = 'refunded';
      else if (eventType.includes('void')) status = 'voided';
      else status = 'approved';
    } else if (eventType.endsWith('.failure')) {
      status = 'declined';
    }

    const amountDollars = parseFloat(
      txn?.action?.amount ?? txn?.amount ?? eb?.amount ?? 'NaN',
    );
    return {
      eventType,
      eventId: envelope.event_id,
      processorTxnId: processorTxnId != null ? String(processorTxnId) : undefined,
      status,
      amountCents: Number.isFinite(amountDollars)
        ? Math.round(amountDollars * 100)
        : undefined,
      raw: envelope,
    };
  }

  /**
   * Query API fallback when webhooks aren't enabled — POST /api/query.php
   * with transaction_id and regex-extract condition + last action response.
   * Returns null when unreachable/unconfigured (callers poll opportunistically).
   */
  async queryTransaction(
    processorTxnId: string,
  ): Promise<{ transactionId: string; condition?: string; raw: string } | null> {
    if (!this.isConfigured()) return null;
    try {
      const xml = (await this.post('/api/query.php', {
        transaction_id: processorTxnId,
      })) as string;
      const condition = /<condition>([^<]+)<\/condition>/.exec(xml)?.[1];
      return { transactionId: processorTxnId, condition, raw: xml.slice(0, 4000) };
    } catch (err) {
      this.logger.warn(
        `query.php ${processorTxnId} failed: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
