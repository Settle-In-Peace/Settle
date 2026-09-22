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

/**
 * MyFreeScoreNow provider — tri-bureau credit data via REST API.
 *
 * Sandbox: https://uat-api.myfreescorenow.com
 * Auth: Bearer token from POST /api/auth/login
 *
 * Products:
 *   - Credit Snapshot  (soft pull, score + summary)
 *   - Funding Snapshot (qualification-focused soft pull)
 *   - 3B Reports       (tri-bureau full report)
 *   - Enrollment       (enroll consumer in monitoring)
 *
 * Only the Login endpoint is publicly documented. The credit-pull
 * endpoints are provisioned per-account — paths are configurable via
 * env vars so they can be adjusted without code changes once full
 * docs are provided by MyFreeScoreNow support.
 */
@Injectable()
export class MyFreeScoreNowProvider implements CreditProvider {
  readonly name = 'myfreescorenow';
  private readonly logger = new Logger(MyFreeScoreNowProvider.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>(
      'MFSN_API_BASE_URL',
      'https://uat-api.myfreescorenow.com',
    );
  }

  private get email(): string {
    return this.config.get<string>('MFSN_API_EMAIL', '');
  }

  private get password(): string {
    return this.config.get<string>('MFSN_API_PASSWORD', '');
  }

  /** Endpoint paths — configurable for when full docs arrive */
  private get creditSnapshotPath(): string {
    return this.config.get<string>('MFSN_CREDIT_SNAPSHOT_PATH', '/api/credit-snapshot');
  }

  private get fundingSnapshotPath(): string {
    return this.config.get<string>('MFSN_FUNDING_SNAPSHOT_PATH', '/api/funding-snapshot');
  }

  private get threeBReportPath(): string {
    return this.config.get<string>('MFSN_3B_REPORT_PATH', '/api/3b-reports');
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async authenticate(): Promise<string> {
    // Reuse cached token if still valid (5-minute buffer)
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (!this.email || !this.password) {
      throw new Error(
        'MyFreeScoreNow credentials not configured. Set MFSN_API_EMAIL and MFSN_API_PASSWORD.',
      );
    }

    const url = `${this.baseUrl}/api/auth/login`;
    this.logger.log(`Authenticating with MyFreeScoreNow at ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MyFreeScoreNow login failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as MfsnLoginResponse;
    if (!data.success || !data.token) {
      throw new Error(`MyFreeScoreNow login failed: ${data.message}`);
    }

    this.cachedToken = data.token;
    // Tokens appear to be Laravel-style (id|hash) — cache for 55 minutes
    this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;

    this.logger.log('MyFreeScoreNow authentication successful');
    return data.token;
  }

  async healthCheck(): Promise<boolean> {
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
    const { url, body } = this.buildRequest(req);

    this.logger.log(
      `Pulling ${req.product} (${req.pullType}) for ${req.firstName} ${req.lastName}`,
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(
        `MyFreeScoreNow ${req.product} failed (${res.status}): ${errBody}`,
      );
    }

    const raw = await res.json();
    return this.normalizeResponse(raw);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildRequest(req: CreditPullRequest): { url: string; body: Record<string, any> } {
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
        throw new Error(`Unknown product: ${req.product}`);
    }

    const body: Record<string, any> = {
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

    // Consent metadata
    body.consent = {
      grantedAt: req.consent.grantedAt.toISOString(),
      method: req.consent.method,
      ipAddress: req.consent.ipAddress,
      userAgent: req.consent.userAgent,
    };

    return { url: `${this.baseUrl}${path}`, body };
  }

  /**
   * Normalize the provider response into our internal schema.
   * The exact response shape will be confirmed once full API docs
   * are provided. This handles common JSON structures and falls
   * back gracefully.
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
