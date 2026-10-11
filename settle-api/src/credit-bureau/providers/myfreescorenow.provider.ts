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

export type MfsnEnrollmentProduct = 'member' | 'credit' | 'funding';
export type MfsnDitDecision = 'Approve' | 'Review' | 'Deny';

export interface MfsnStartEnrollmentInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region: string;
  postalCode: string;
  /** MM/DD/YYYY */
  dob: string;
  /** 9 digits, no dashes */
  ssn: string;
  /** 10-digit mobile, no formatting */
  number: string;
  email: string;
  /** URL where the applicant provided consent */
  consentURL: string;
  planId: string;
  password: string;
}

export interface MfsnStartEnrollmentResult {
  correlationId: string;
  decision: MfsnDitDecision;
  message?: string;
  raw: Record<string, any>;
}

export interface MfsnPaymentInput {
  correlationId: string;
  firstName: string;
  lastName: string;
  cardNumber: string;
  cvv: string;
  billingZip: string;
  expiryMonth: number;
  expiryYear: number;
  term: 'monthly' | 'yearly';
  installment?: string;
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
 * MyFreeScoreNow provider — member enrollment + credit monitoring via REST API.
 *
 * Environments (selected via MFSN_ENV=sandbox|production, or override
 * entirely with MFSN_API_BASE_URL):
 *   Sandbox:    https://uat-api.myfreescorenow.com
 *   Production: https://api.myfreescorenow.com
 *
 * Auth: POST /api/auth/login { email: <api user>, password } -> { token }.
 *   Bearer token, cached ~55 minutes.
 *
 * REAL endpoint map (extracted from the affiliate API Reference on
 * 2026-10-10 — the product sections share one enrollment lifecycle):
 *
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *
 *   Enrollment lifecycle (one per product segment — member | credit | funding):
 *   POST /api/auth/enrollment/{seg}/start-enroll     — DIT identity check
 *                                                    -> { correlationId, decision }
 *   POST /api/auth/enrollment/{seg}/send-link        — SMFA link to applicant
 *   POST /api/auth/enrollment/{seg}/validate-link    — confirm link consumed
 *   POST /api/auth/enrollment/{seg}/enroll           — complete enrollment
 *   POST /api/auth/enrollment/{seg}/payment          — card on file -> ACTIVE member
 *   POST /api/auth/enrollment/plan-details/          — available plans
 *
 *   Reports (require an enrolled member, keyed by member email):
 *   POST /api/auth/enrollment/credit/getOneBReport   { email }
 *   POST /api/auth/enrollment/funding/getOneBReport  { email }
 *   POST /api/auth/fetch-3B-json                     { email, client_token }
 *
 *   Test utilities (sandbox only):
 *   POST /api/auth/clear-ssn          { ssn }
 *   POST /api/auth/cancel-enrollment  { firstName, lastName, ssn }
 *
 * Security: credentials, tokens, and member PII are NEVER logged. Log lines
 * only include method + path + upstream status.
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

  /** Client token required by fetch-3B-json — from the affiliate dashboard. */
  private get clientToken(): string {
    return this.config.get<string>('MFSN_CLIENT_TOKEN', '');
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

  /** Base path for enrollment endpoints — overridable if MFSN changes layout. */
  private get enrollmentBase(): string {
    return this.config.get<string>(
      'MFSN_ENROLLMENT_BASE',
      '/api/auth/enrollment',
    ).replace(/\/$/, '');
  }

  private get loginPath(): string {
    return this.config.get<string>('MFSN_LOGIN_PATH', '/api/auth/login');
  }

  private seg(product: MfsnEnrollmentProduct): string {
    return `${this.enrollmentBase}/${product}`;
  }

  // ── HTTP plumbing (timeout + bounded retry, fail-closed on 4xx) ────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * fetch with a hard timeout and bounded exponential-backoff retries.
   * Retries: network failures, 429, 5xx. Never retries 4xx (fail-closed —
   * a rejected enrollment/credit request must not be silently re-submitted).
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

  /** Authenticated POST with automatic one-shot token refresh on 401. */
  private async authedPost(
    path: string,
    body: Record<string, any>,
    retried = false,
  ): Promise<any> {
    const token = await this.authenticate();
    let res: Response;
    try {
      res = await this.request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof MfsnUpstreamError && err.status === 401 && !retried) {
        this.cachedToken = null;
        this.tokenExpiresAt = 0;
        return this.authedPost(path, body, true);
      }
      throw err;
    }
    return res.json();
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
    // Laravel Sanctum-style token — cache for 55 minutes
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

  // ── Enrollment lifecycle ────────────────────────────────────────────────

  /**
   * Step 1 — Start Enrollment. Runs Digital Identity Trust (DIT) verification
   * on the applicant. Returns a correlationId used by every subsequent step,
   * plus a decision: Approve (continue) | Review (manual review) | Deny (stop).
   */
  async startEnrollment(
    input: MfsnStartEnrollmentInput,
    product: MfsnEnrollmentProduct = 'member',
  ): Promise<MfsnStartEnrollmentResult> {
    this.logger.log(`startEnrollment (${product}) — DIT check`);
    const raw = await this.authedPost(`${this.seg(product)}/start-enroll`, {
      ...input,
      type: product,
    });
    if (!raw?.correlationId) {
      throw new MfsnUpstreamError(
        `MyFreeScoreNow start-enroll returned no correlationId: ${raw?.message ?? 'unknown'}`,
      );
    }
    return {
      correlationId: raw.correlationId,
      decision: raw.decision,
      message: raw.message,
      raw,
    };
  }

  /**
   * Step 2 — Send Link (SMFA). Emails (or SMS) the applicant a secure
   * verification link. Only valid for correlationIds whose DIT decision
   * was Approve.
   */
  async sendEnrollmentLink(
    correlationId: string,
    opts: {
      subjectIdentifier: string;
      subjectType?: 'Email' | 'Sms';
      redirectUrl: string;
    },
    product: MfsnEnrollmentProduct = 'member',
  ): Promise<Record<string, any>> {
    this.logger.log(`sendEnrollmentLink (${product})`);
    return this.authedPost(`${this.seg(product)}/send-link`, {
      correlationId,
      subjectIdentifier: opts.subjectIdentifier,
      subjectType: opts.subjectType ?? 'Email',
      redirectUrl: opts.redirectUrl,
    });
  }

  /** Step 3 — Validate Link. Confirms the applicant consumed the SMFA link. */
  async validateEnrollmentLink(
    correlationId: string,
    product: MfsnEnrollmentProduct = 'member',
  ): Promise<Record<string, any>> {
    this.logger.log(`validateEnrollmentLink (${product})`);
    return this.authedPost(`${this.seg(product)}/validate-link`, {
      correlationId,
    });
  }

  /**
   * Step 4 — Complete Enrollment. Creates the member account after the
   * SMFA link is validated.
   */
  async completeEnrollment(
    correlationId: string,
    product: MfsnEnrollmentProduct = 'member',
  ): Promise<Record<string, any>> {
    this.logger.log(`completeEnrollment (${product})`);
    return this.authedPost(`${this.seg(product)}/enroll`, { correlationId });
  }

  /** Available subscription plans for this affiliate account. */
  async getPlanDetails(): Promise<Record<string, any>> {
    this.logger.log('getPlanDetails');
    return this.authedPost(`${this.enrollmentBase}/plan-details/`, {});
  }

  /**
   * Step 5 — Payment. Attaches a card and bills the first period; a paid
   * member is what counts as an "Active" for affiliate commissions.
   */
  async submitPayment(
    input: MfsnPaymentInput,
    product: MfsnEnrollmentProduct = 'member',
  ): Promise<Record<string, any>> {
    this.logger.log(`submitPayment (${product})`);
    return this.authedPost(`${this.seg(product)}/payment`, { ...input });
  }

  // ── Member reports ──────────────────────────────────────────────────────

  /**
   * 1B report summary for an enrolled member — product segment selects the
   * credit vs funding variant of the report.
   */
  async getMember1BReport(
    memberEmail: string,
    product: 'credit' | 'funding' = 'credit',
  ): Promise<Record<string, any>> {
    this.logger.log(`getMember1BReport (${product})`);
    return this.authedPost(`${this.seg(product)}/getOneBReport`, {
      email: memberEmail,
    });
  }

  /** Full tri-bureau report for an enrolled member. Requires MFSN_CLIENT_TOKEN. */
  async getMember3BReport(memberEmail: string): Promise<Record<string, any>> {
    if (!this.clientToken) {
      throw new MfsnNotConfiguredError();
    }
    this.logger.log('getMember3BReport');
    return this.authedPost('/api/auth/fetch-3B-json', {
      email: memberEmail,
      client_token: this.clientToken,
    });
  }

  // ── Sandbox test utilities (not available in production) ───────────────

  /** Clear a test member's SSN so sandbox test data can be re-used. */
  async clearTestSsn(ssn: string): Promise<Record<string, any>> {
    this.logger.log('clearTestSsn');
    return this.authedPost('/api/auth/clear-ssn', { ssn });
  }

  /** Cancel a test enrollment in UAT (restart a test case). */
  async cancelTestEnrollment(input: {
    firstName: string;
    lastName: string;
    ssn: string;
  }): Promise<Record<string, any>> {
    this.logger.log('cancelTestEnrollment');
    return this.authedPost('/api/auth/cancel-enrollment', { ...input });
  }

  // ── Credit Pull (member reports) ───────────────────────────────────────

  /**
   * Pull a credit report for an ALREADY-ENROLLED member. MFSN reports are
   * keyed by member email — pass it via `email` (preferred) or `referenceId`.
   * New consumers must go through the enrollment lifecycle first; there is
   * no anonymous-pull endpoint.
   */
  async pullCredit(req: CreditPullRequest): Promise<CreditPullResult> {
    const memberEmail = req.email ?? req.referenceId;
    if (!memberEmail) {
      throw new MfsnUpstreamError(
        'MyFreeScoreNow reports require an enrolled member email (req.email).',
      );
    }

    this.logger.log(
      `Pulling ${req.product} (${req.pullType}) for enrolled member ref=${req.referenceId ?? 'n/a'}`,
    );

    let raw: Record<string, any>;
    if (req.product === CreditReportProduct.THREE_B_REPORT) {
      raw = await this.getMember3BReport(memberEmail);
    } else {
      raw = await this.getMember1BReport(
        memberEmail,
        req.product === CreditReportProduct.FUNDING_SNAPSHOT
          ? 'funding'
          : 'credit',
      );
    }

    return this.normalizeResponse(raw);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Normalize the provider response into our internal schema.
   * The exact response shape is confirmed incrementally as UAT calls land —
   * the raw payload is always preserved in `rawResponse` for audit.
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
