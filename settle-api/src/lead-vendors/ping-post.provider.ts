import { Logger } from '@nestjs/common';
import {
  LeadCriteria,
  LeadVendorProduct,
  LeadVendorProvider,
  LeadVendorStatus,
  LeadVendorNotConfiguredError,
  LeadVendorUpstreamError,
  PingResult,
  PostResult,
  VendorLeadData,
  VendorPurchaseResult,
} from './lead-vendor-provider.interface';

/**
 * Non-secret configuration for a generic ping/post lead vendor.
 * Resolved by LeadVendorRegistry from `LEADVENDORS_CONFIG` JSON and/or
 * `LEADVENDOR_<NAME>_*` env vars — see lead-vendors/README notes in the
 * module header. Secrets (apiKey, webhookSecret) are injected only from env.
 */
export interface PingPostVendorConfig {
  name: string;
  displayName?: string;
  /** Ping endpoint (criteria → bid/price). */
  pingUrl?: string;
  /** Post endpoint (full lead → accept/reject). */
  postUrl?: string;
  /** Bulk order endpoint (criteria + quantity → leads). Defaults to postUrl. */
  orderUrl?: string;
  apiKey?: string;
  /** How apiKey is sent: bearer token, custom header, or body/query param. */
  authStyle?: 'bearer' | 'header' | 'param' | 'none';
  /** Header name when authStyle=header (default 'x-api-key'). */
  authHeader?: string;
  /** Param name when authStyle=param (default 'api_key'). */
  authParam?: string;
  /** Wire format for request bodies. Default 'form' (most ping/post vendors). */
  format?: 'form' | 'json';
  /** Static per-lead price when the vendor doesn't ping. */
  basePrice?: number;
  /** Static product catalogue (defaults to a single ping-post product). */
  products?: LeadVendorProduct[];
  /** Rename our field names → vendor field names (e.g. { phone: 'Primary_Phone' }). */
  fieldMap?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Generic ping/post vendor adapter — the standard lead-gen wire format used
 * by boberdoo, LeadsPedia, LeadProsper and compatible platforms:
 *
 *   1. PING — send lead criteria (optionally partial PII) → vendor replies
 *      with accept/reject + bid price and a ping/transaction id.
 *   2. POST — send the full lead (echoing the ping id) → vendor replies
 *      accept/reject, optionally with a consumer redirect URL.
 *
 * Bulk buys use `orderUrl` (criteria + quantity → inline leads or an async
 * delivery acknowledgement). Response normalization tolerates the common
 * field spellings (`price|bid|payout`, `status: matched|accepted|rejected`,
 * `ping_id|transaction_id`, `redirect_url`) across JSON, form-encoded and
 * light XML responses — the raw response is always preserved for audit.
 *
 * Security: apiKey is sent per `authStyle` but NEVER logged; log lines only
 * include the vendor name, method, host, and upstream status.
 */
export class PingPostVendorProvider implements LeadVendorProvider {
  private readonly logger: Logger;

  constructor(private readonly cfg: PingPostVendorConfig) {
    this.logger = new Logger(`PingPostVendorProvider:${cfg.name}`);
  }

  get name(): string {
    return this.cfg.name;
  }

  get displayName(): string {
    return this.cfg.displayName ?? this.cfg.name;
  }

  get supportsPingPost(): boolean {
    return Boolean(this.cfg.pingUrl && this.cfg.postUrl);
  }

  /** Outbound calls are possible when at least one endpoint is configured. */
  isConfigured(): boolean {
    return Boolean(this.cfg.pingUrl || this.cfg.postUrl || this.cfg.orderUrl);
  }

  private get timeoutMs(): number {
    return this.cfg.timeoutMs ?? 15_000;
  }

  private get maxRetries(): number {
    return this.cfg.maxRetries ?? 2;
  }

  private get format(): 'form' | 'json' {
    return this.cfg.format ?? 'form';
  }

  status(): LeadVendorStatus {
    return {
      name: this.name,
      displayName: this.displayName,
      configured: this.isConfigured(),
      active: true, // merged with lead_vendor_accounts.is_active by the registry
      supportsPingPost: this.supportsPingPost,
      products: this.listProducts(),
    };
  }

  listProducts(): LeadVendorProduct[] {
    if (this.cfg.products?.length) return this.cfg.products;
    if (!this.isConfigured()) return [];
    return [
      {
        id: 'default',
        name: this.supportsPingPost ? 'Ping/post leads' : 'Leads',
        price: this.cfg.basePrice,
        delivery: this.supportsPingPost ? 'ping_post' : 'api_order',
      },
    ];
  }

  // ── HTTP plumbing (timeout + bounded retry, fail-closed on 4xx) ────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertConfigured(endpoint?: string): asserts endpoint {
    if (!endpoint || !this.isConfigured()) {
      throw new LeadVendorNotConfiguredError(this.name);
    }
  }

  /**
   * fetch with a hard timeout and bounded exponential-backoff retries.
   * Retries: network failures, 429, 5xx. Never retries 4xx — a rejected
   * ping/post must not be silently re-submitted (billing exposure).
   */
  private async request(
    url: string,
    init: RequestInit,
    attempt = 0,
  ): Promise<Response> {
    const method = init.method ?? 'GET';
    const host = safeHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      if (attempt < this.maxRetries) {
        const backoff = 250 * 2 ** attempt;
        this.logger.warn(
          `${method} ${host} network${isTimeout ? ' timeout' : ''} error — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
        );
        await this.sleep(backoff);
        return this.request(url, init, attempt + 1);
      }
      throw new LeadVendorUpstreamError(
        this.name,
        `${this.displayName} unreachable after ${attempt + 1} attempt(s): ${isTimeout ? 'timeout' : (err as Error).message}`,
      );
    }
    clearTimeout(timer);

    if (res.ok) return res;

    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      const body = await this.safeBody(res);
      throw new LeadVendorUpstreamError(
        this.name,
        `${this.displayName} ${method} ${host} rejected (${res.status}): ${body}`,
        res.status,
      );
    }

    if (attempt < this.maxRetries) {
      const backoff = 250 * 2 ** attempt;
      this.logger.warn(
        `${method} ${host} -> ${res.status} — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
      );
      await this.sleep(backoff);
      return this.request(url, init, attempt + 1);
    }

    const body = await this.safeBody(res);
    throw new LeadVendorUpstreamError(
      this.name,
      `${this.displayName} ${method} ${host} failed (${res.status}) after ${attempt + 1} attempt(s): ${body}`,
      res.status,
    );
  }

  private async safeBody(res: Response): Promise<string> {
    try {
      const text = await res.text();
      return text.slice(0, 300);
    } catch {
      return '(unreadable body)';
    }
  }

  // ── Payload building ──────────────────────────────────────────────────

  /** Rename our canonical fields to vendor-specific names via fieldMap. */
  private applyFieldMap(payload: Record<string, unknown>): Record<string, unknown> {
    const map = this.cfg.fieldMap;
    if (!map || !Object.keys(map).length) return payload;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      out[map[key] ?? key] = value;
    }
    return out;
  }

  private buildInit(payload: Record<string, unknown>): RequestInit {
    const body = this.applyFieldMap(payload);
    const headers: Record<string, string> = {};
    const authStyle = this.cfg.authStyle ?? (this.cfg.apiKey ? 'bearer' : 'none');

    if (this.cfg.apiKey) {
      if (authStyle === 'bearer') {
        headers['Authorization'] = `Bearer ${this.cfg.apiKey}`;
      } else if (authStyle === 'header') {
        headers[this.cfg.authHeader ?? 'x-api-key'] = this.cfg.apiKey;
      } else if (authStyle === 'param') {
        body[this.cfg.authParam ?? 'api_key'] = this.cfg.apiKey;
      }
    }

    if (this.format === 'json') {
      headers['Content-Type'] = 'application/json';
      headers['Accept'] = 'application/json';
      return { method: 'POST', headers, body: JSON.stringify(body) };
    }

    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;
      params.set(
        key,
        Array.isArray(value) ? value.join(',') : String(value),
      );
    }
    return { method: 'POST', headers, body: params.toString() };
  }

  // ── Response normalization ─────────────────────────────────────────────

  /**
   * Parse a vendor response body into a flat record. Handles JSON objects,
   * `a=b&c=d` form bodies and light XML — all common among ping/post vendors.
   */
  private async parseBody(res: Response): Promise<Record<string, any>> {
    const text = await res.text();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed };
    } catch {
      /* fall through */
    }
    const flat: Record<string, any> = {};
    if (text.includes('=') && (text.includes('&') || !text.trimStart().startsWith('<'))) {
      for (const [key, value] of new URLSearchParams(text)) flat[key] = value;
      return flat;
    }
    // Minimal XML: pull leaf elements into a flat map.
    const tagRe = /<([A-Za-z0-9_:-]+)>([^<]*)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(text))) {
      if (m[2] !== '') flat[m[1]] = m[2];
    }
    return flat;
  }

  private pick<T>(raw: Record<string, any>, keys: string[]): T | undefined {
    for (const key of keys) {
      if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
        return raw[key] as T;
      }
    }
    // One level of nesting is common ({response: {...}}, {result: {...}})
    for (const nestKey of ['response', 'result', 'data', 'ping', 'post']) {
      const nested = raw[nestKey];
      if (nested && typeof nested === 'object') {
        for (const key of keys) {
          if (nested[key] !== undefined && nested[key] !== null && nested[key] !== '') {
            return nested[key] as T;
          }
        }
      }
    }
    return undefined;
  }

  private asNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private normalizeAcceptance(
    raw: Record<string, any>,
  ): { accepted: boolean; rejectionReason?: string } {
    const status = String(
      this.pick(raw, ['status', 'result', 'outcome', 'disposition']) ?? '',
    ).toLowerCase();
    const explicitAccepted = this.pick<boolean | string>(raw, [
      'accepted',
      'success',
      'matched',
      'isAccepted',
    ]);
    const reason = this.pick<string>(raw, [
      'rejection_reason',
      'rejectionReason',
      'reason',
      'error',
      'message',
      'error_message',
    ]);

    const ACCEPTED = new Set(['matched', 'accepted', 'success', 'sold', 'ok', 'true']);
    const REJECTED = new Set([
      'rejected', 'unmatched', 'error', 'failed', 'failure', 'declined', 'duplicate', 'false',
    ]);

    if (REJECTED.has(status) || explicitAccepted === false || explicitAccepted === 'false') {
      return { accepted: false, rejectionReason: reason ?? status ?? 'rejected' };
    }
    if (
      ACCEPTED.has(status) ||
      explicitAccepted === true ||
      explicitAccepted === 'true'
    ) {
      return { accepted: true };
    }
    // Ambiguous: a price/id present with no explicit rejection ⇒ accepted.
    if (
      this.pick(raw, ['price', 'bid', 'payout', 'ping_id', 'transaction_id', 'lead_id'])
    ) {
      return { accepted: true };
    }
    return { accepted: false, rejectionReason: reason ?? 'unrecognized response' };
  }

  private normalizePing(raw: Record<string, any>): PingResult {
    const { accepted, rejectionReason } = this.normalizeAcceptance(raw);
    return {
      accepted,
      pingId: this.pick<string>(raw, [
        'ping_id', 'pingId', 'transaction_id', 'transactionId', 'id', 'request_id',
      ]),
      price: this.asNumber(
        this.pick(raw, ['price', 'bid', 'payout', 'lead_price', 'leadPrice', 'amount']),
      ),
      rejectionReason,
      raw,
    };
  }

  private normalizePost(raw: Record<string, any>): PostResult {
    const { accepted, rejectionReason } = this.normalizeAcceptance(raw);
    return {
      accepted,
      postId: this.pick<string>(raw, [
        'post_id', 'postId', 'lead_id', 'leadId', 'transaction_id', 'transactionId', 'id',
      ]),
      price: this.asNumber(
        this.pick(raw, ['price', 'payout', 'lead_price', 'leadPrice', 'amount']),
      ),
      rejectionReason,
      redirectUrl: this.pick<string>(raw, [
        'redirect_url', 'redirectUrl', 'redirect', 'landing_url', 'confirmation_url',
      ]),
      raw,
    };
  }

  // ── Ping / post / order ────────────────────────────────────────────────

  async ping(lead: VendorLeadData): Promise<PingResult> {
    this.assertConfigured(this.cfg.pingUrl);
    const res = await this.request(
      this.cfg.pingUrl!,
      this.buildInit({ type: 'ping', ...lead }),
    );
    return this.normalizePing(await this.parseBody(res));
  }

  async post(lead: VendorLeadData, pingId?: string): Promise<PostResult> {
    this.assertConfigured(this.cfg.postUrl);
    const payload: Record<string, unknown> = { type: 'post', ...lead };
    if (pingId) payload.pingId = pingId;
    const res = await this.request(this.cfg.postUrl!, this.buildInit(payload));
    return this.normalizePost(await this.parseBody(res));
  }

  /** Price a hypothetical lead — a ping carrying criteria, not a person. */
  async priceLead(criteria: LeadCriteria): Promise<PingResult> {
    if (this.cfg.pingUrl) {
      return this.ping({ ...criteria });
    }
    // Static pricing vendor: synthesized ping result, no upstream call.
    if (this.cfg.basePrice !== undefined) {
      return { accepted: true, price: this.cfg.basePrice };
    }
    this.assertConfigured(undefined);
  }

  /**
   * Bulk purchase: POST criteria + quantity to the order endpoint. Vendors
   * that return leads inline have them normalized here; vendors that deliver
   * asynchronously (webhook/file) return an empty `leads` array and the
   * delivered leads arrive via the import pipeline instead.
   */
  async purchaseLeads(
    criteria: LeadCriteria,
    quantity: number,
  ): Promise<VendorPurchaseResult> {
    const url = this.cfg.orderUrl ?? this.cfg.postUrl;
    this.assertConfigured(url);
    const res = await this.request(
      url!,
      this.buildInit({ type: 'order', quantity, ...criteria }),
    );
    const raw = await this.parseBody(res);
    const { accepted, rejectionReason } = this.normalizeAcceptance(raw);

    const rawLeads = this.pick<any[]>(raw, ['leads', 'data', 'records', 'items']);
    const leads: VendorLeadData[] = Array.isArray(rawLeads) ? rawLeads : [];
    const pricePerLead = this.asNumber(
      this.pick(raw, ['price', 'price_per_lead', 'pricePerLead', 'lead_price', 'payout']),
    );

    if (!accepted) {
      throw new LeadVendorUpstreamError(
        this.name,
        `${this.displayName} order rejected: ${rejectionReason ?? 'no reason given'}`,
      );
    }

    return {
      purchaseId: this.pick<string>(raw, [
        'order_id', 'orderId', 'purchase_id', 'transaction_id', 'transactionId', 'id',
      ]),
      leads,
      quantityReceived: leads.length,
      pricePerLead,
      totalCost:
        pricePerLead !== undefined
          ? pricePerLead * (leads.length || quantity)
          : undefined,
      raw,
    };
  }
}

/** Hostname-only for log lines — never log a full URL (may contain a key). */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}
