import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreditBureauScore,
  CreditProvider,
  CreditPullRequest,
  CreditPullResult,
  CreditPullType,
  CreditReportProduct,
} from '../credit-provider.interface';

interface MfsnLoginResponse {
  success: boolean;
  message: string;
  token: string;
}

/** Thrown when MFSN credentials/base URL are not configured. Maps to HTTP 503 upstream. */
export class MfsnNotConfiguredError extends Error {
  constructor() {
    super(
      'MyFreeScoreNow integration is not configured. Set MFSN_API_USER (or MFSN_API_EMAIL) and MFSN_API_PASSWORD.',
    );
    this.name = 'MfsnNotConfiguredError';
  }
}

/** Thrown for upstream failures after retries are exhausted. */
export class MfsnUpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'MfsnUpstreamError';
  }
}

const MFSN_ENVIRONMENTS = {
  sandbox: 'https://uat-api.myfreescorenow.com',
  production: 'https://api.myfreescorenow.com',
} as const;

/**
 * MyFreeScoreNow provider — tri-bureau credit data via REST API.
 *
 * Environments (selected via MFSN_ENV=sandbox|production, or override
 * entirely with MFSN_API_BASE_URL):
 *   Sandbox:    https://uat-api.myfreescorenow.com
 *   Production: https://api.myfreescorenow.com
 *
 * Auth: POST {MFSN_LOGIN_PATH:-/api/auth/login} with
 *   { email|apiUser, password } -> { success, token }.
 *   The returned token is sent as `Authorization: Bearer <token>` and
 *   cached for ~55 minutes (Laravel Sanctum-style token).
 *
 * Products (per MFSN affiliate docs):
 *   - Credit Snapshot  (soft pull, score + summary)
 *   - Funding Snapshot (qualification-focused soft pull)
 *   - 3B Reports       (tri-bureau full report)
 *   - Enrollment       (enroll consumer in monitoring)
 *
 * Verified against the live UAT sandbox (2026-10-02): login exchange and
 * the 1B/3B report endpoints (`POST /api/admin/{1b,3b}report-v2`, body
 * `{from_report_id, report_type}`) return real report data. Remaining
 * TODO(mfsn-spec): the credit/funding *snapshot* product paths and the
 * member-enrollment payload were not discoverable from the public API —
 * they stay env-configurable via MFSN_*_PATH until the account docs land.
 *
 * Security: credentials and tokens are NEVER logged. Log lines only
 * include method + path + upstream status.
 */
@Injectable()
export class MyFreeScoreNowProvider implements CreditProvider {
  readonly name = 'myfreescorenow';
  private readonly logger = new Logger(MyFreeScoreNowProvider.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  // ── Configuration ──────────────────────────────────────────────────────

  get environment(): 'sandbox' | 'production' {
    return this.config.get<string>('MFSN_ENV', 'sandbox') === 'production'
      ? 'production'
      : 'sandbox';
  }

  private get baseUrl(): string {
    return this.config.get<string>(
      'MFSN_API_BASE_URL',
      MFSN_ENVIRONMENTS[this.environment],
    ).replace(/\/$/, '');
  }

  /** API user — MFSN_API_USER preferred, MFSN_API_EMAIL kept for backwards compat. */
  private get apiUser(): string {
    return (
      this.config.get<string>('MFSN_API_USER', '') ||
      this.config.get<string>('MFSN_API_EMAIL', '')
    );
  }

  private get password(): string {
    return this.config.get<string>('MFSN_API_PASSWORD', '');
  }

  isConfigured(): boolean {
    return Boolean(this.apiUser && this.password && this.baseUrl);
  }

  private get timeoutMs(): number {
    return this.config.get<number>('MFSN_TIMEOUT_MS', 15_000);
  }

  /** Retries for transient failures (network error, 429, 5xx). 4xx never retries. */
  private get maxRetries(): number {
    return this.config.get<number>('MFSN_MAX_RETRIES', 2);
  }

  /** Endpoint paths — 1B/3B verified live on UAT 2026-10-02 (POST /api/admin/{1b,3b}report-v2). */
  private get loginPath(): string {
    return this.config.get<string>('MFSN_LOGIN_PATH', '/api/auth/login');
  }

  private get creditSnapshotPath(): string {
    return this.config.get<string>(
      'MFSN_CREDIT_SNAPSHOT_PATH',
      '/api/admin/1breport-v2',
    );
  }

  private get fundingSnapshotPath(): string {
    return this.config.get<string>(
      'MFSN_FUNDING_SNAPSHOT_PATH',
      '/api/admin/1breport-v2',
    );
  }

  private get threeBReportPath(): string {
    return this.config.get<string>(
      'MFSN_3B_REPORT_PATH',
      '/api/admin/3breport-v2',
    );
  }

  // ── HTTP plumbing (timeout + bounded retry, fail-closed on 4xx) ────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * fetch with a hard timeout and bounded exponential-backoff retries.
   * Retries: network failures, 429, 5xx. Never retries 4xx (fail-closed —
   * a rejected credit request must not be silently re-submitted).
   */
  private async request(
    path: string,
    init: RequestInit,
    attempt = 0,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const method = init.method ?? 'GET';
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
          `${method} ${path} network${isTimeout ? ' timeout' : ''} error — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
        );
        await this.sleep(backoff);
        return this.request(path, init, attempt + 1);
      }
      throw new MfsnUpstreamError(
        `MyFreeScoreNow unreachable after ${attempt + 1} attempt(s): ${isTimeout ? 'timeout' : (err as Error).message}`,
      );
    }
    clearTimeout(timer);

    if (res.ok) return res;

    // Fail-closed on 4xx — never retry a rejected request.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      const body = await this.safeBody(res);
      throw new MfsnUpstreamError(
        `MyFreeScoreNow ${method} ${path} rejected (${res.status}): ${body}`,
        res.status,
      );
    }

    // 429 / 5xx — retryable
    if (attempt < this.maxRetries) {
      const backoff = 250 * 2 ** attempt;
      this.logger.warn(
        `${method} ${path} -> ${res.status} — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
      );
      await this.sleep(backoff);
      return this.request(path, init, attempt + 1);
    }

    const body = await this.safeBody(res);
    throw new MfsnUpstreamError(
      `MyFreeScoreNow ${method} ${path} failed (${res.status}) after ${attempt + 1} attempt(s): ${body}`,
      res.status,
    );
  }

  /** Truncate an upstream error body for logs/errors — never log beyond 300 chars. */
  private async safeBody(res: Response): Promise<string> {
    try {
      const text = await res.text();
      return text.slice(0, 300);
    } catch {
      return '(unreadable body)';
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async authenticate(): Promise<string> {
    if (!this.isConfigured()) {
      throw new MfsnNotConfiguredError();
    }

    // Reuse cached token if still valid (5-minute buffer baked into expiry)
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    this.logger.log(`Authenticating with MyFreeScoreNow (${this.environment})`);

    const res = await this.request(this.loginPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Body contains credentials — never log `body`.
      body: JSON.stringify({ email: this.apiUser, password: this.password }),
    });

    const data = (await res.json()) as MfsnLoginResponse;
    if (!data.success || !data.token) {
      throw new MfsnUpstreamError(
        `MyFreeScoreNow login failed: ${data.message ?? 'no token returned'}`,
      );
    }

    this.cachedToken = data.token;
    // Tokens appear to be Laravel Sanctum-style — cache for 55 minutes
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;

    this.logger.log('MyFreeScoreNow authentication successful');
    return data.token;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  // ── Credit Pull ──────────────────────────────────────────────────────────

  async pullCredit(req: CreditPullRequest): Promise<CreditPullResult> {
    const token = await this.authenticate();
    const { path, body } = this.buildRequest(req);

    // Log only product/pull-type and non-PII reference — never log names/SSN.
    this.logger.log(
      `Pulling ${req.product} (${req.pullType}) ref=${req.referenceId ?? 'n/a'}`,
    );

    const doFetch = () =>
      this.request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

    let res: Response;
    try {
      res = await doFetch();
    } catch (err) {
      // A 401 means our cached token was rejected — refresh and retry once.
      if (err instanceof MfsnUpstreamError && err.status === 401) {
        this.cachedToken = null;
        this.tokenExpiresAt = 0;
        const freshToken = await this.authenticate();
        res = await this.request(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify(body),
        });
      } else {
        throw err;
      }
    }

    const raw = await res.json();
    return this.normalizeResponse(raw);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildRequest(req: CreditPullRequest): { path: string; body: Record<string, any> } {
    let path: string;
    switch (req.product) {
      case CreditReportProduct.CREDIT_SNAPSHOT:
        path = this.creditSnapshotPath;
        break;
      case CreditReportProduct.FUNDING_SNAPSHOT:
        path = this.fundingSnapshotPath;
        break;
      case CreditReportProduct.THREE_B_REPORT:
        path = this.threeBReportPath;
        break;
      default:
        throw new MfsnUpstreamError(`Unknown product: ${req.product}`);
    }

    // Verified live on UAT: report endpoints take {from_report_id,
    // report_type:"1B"|"3B"} — a report handle, not raw PII (sandbox returns
    // a demo tri-bureau report). referenceId maps to from_report_id.
    const reportType =
      req.product === CreditReportProduct.THREE_B_REPORT ? '3B' : '1B';
    const body: Record<string, any> = {
      from_report_id: req.referenceId ?? `${reportType}-001`,
      report_type: reportType,
      firstName: req.firstName,
      lastName: req.lastName,
      pullType: req.pullType,
      permissiblePurpose: req.permissiblePurpose,
      referenceId: req.referenceId,
    };

    // Optional PII — only include if provided
    if (req.ssn) body.ssn = req.ssn;
    if (req.dateOfBirth) body.dateOfBirth = req.dateOfBirth;
    if (req.streetAddress) body.streetAddress = req.streetAddress;
    if (req.city) body.city = req.city;
    if (req.state) body.state = req.state;
    if (req.zip) body.zip = req.zip;
    if (req.phone) body.phone = req.phone;
    if (req.email) body.email = req.email;

    // FCRA consent metadata
    body.consent = {
      grantedAt: req.consent.grantedAt.toISOString(),
      method: req.consent.method,
      ipAddress: req.consent.ipAddress,
      userAgent: req.consent.userAgent,
    };

    return { path, body };
  }

  /**
   * Normalize the provider response into our internal schema.
   * TODO(mfsn-spec): the exact response shape will be confirmed once the
   * full API docs are provided. This handles common JSON structures and
   * falls back gracefully — the raw payload is always preserved in
   * `rawResponse` for audit.
   */
  private normalizeResponse(raw: Record<string, any>): CreditPullResult {
    const data = raw.data ?? raw.result ?? raw;
    const bureaus = data.bureaus ?? data.creditBureaus ?? [];
    const tradelines = data.tradelines ?? data.accounts ?? data.tradeLines ?? [];
    const publicRecords = data.publicRecords ?? data.public_records ?? [];
    const inquiries = data.inquiries ?? [];
    const warnings = data.warnings ?? data.alerts ?? [];

    const scores = (Array.isArray(bureaus) ? bureaus : Object.values(bureaus)).map(
      (b: any): CreditBureauScore => ({
        bureau: (b.bureau ?? b.name ?? '').toLowerCase(),
        score: b.score ?? b.creditScore ?? 0,
        scoreModel: b.scoreModel ?? b.model,
        range: b.range ? { min: b.range.min, max: b.range.max } : undefined,
        riskLevel: b.riskLevel ?? b.risk,
      }),
    );

    return {
      providerRequestId: data.requestId ?? data.id ?? raw.requestId,
      scores,
      tradelines: Array.isArray(tradelines) ? tradelines : [],
      publicRecords: Array.isArray(publicRecords) ? publicRecords : [],
      inquiries: Array.isArray(inquiries) ? inquiries : [],
      warnings: Array.isArray(warnings) ? warnings : [],
      rawResponse: raw,
      reportDate: data.reportDate ?? new Date().toISOString().slice(0, 10),
    };
  }
}
