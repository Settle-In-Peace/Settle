import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreditProvider,
  CreditPullRequest,
  CreditPullResult,
} from './credit-provider.interface';
import {
  MfsnNotConfiguredError,
  MfsnUpstreamError,
  MyFreeScoreNowProvider,
} from './providers/myfreescorenow.provider';
import { PullCreditDto } from './dto/pull-credit.dto';
import {
  CreditReport,
  CreditReportStatus,
} from '../entities/credit-report.entity';

@Injectable()
export class CreditBureauService {
  private readonly logger = new Logger(CreditBureauService.name);
  private readonly providers: Map<string, CreditProvider>;

  constructor(
    private readonly mfsnProvider: MyFreeScoreNowProvider,
    @InjectRepository(CreditReport)
    private readonly creditReportsRepository: Repository<CreditReport>,
  ) {
    this.providers = new Map([['myfreescorenow', mfsnProvider]]);
  }

  /** Get the active provider (extensible to support multiple in future) */
  private getProvider(name = 'myfreescorenow'): CreditProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown credit provider: ${name}`);
    return provider;
  }

  /** Pull credit and persist the result to the audit table */
  async pullCredit(
    dto: PullCreditDto,
    agentId: string,
  ): Promise<{ report: CreditReport; result: CreditPullResult }> {
    const provider = this.getProvider();

    // Fail closed with a clear 503 when credentials aren't configured.
    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        'Credit provider is not configured. Set MFSN_API_USER (or MFSN_API_EMAIL) and MFSN_API_PASSWORD on the API.',
      );
    }

    const req: CreditPullRequest = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      ssn: dto.ssn,
      dateOfBirth: dto.dateOfBirth,
      streetAddress: dto.streetAddress,
      city: dto.city,
      state: dto.state,
      zip: dto.zip,
      phone: dto.phone,
      email: dto.email,
      pullType: dto.pullType,
      product: dto.product,
      permissiblePurpose: dto.permissiblePurpose,
      consent: {
        grantedAt: new Date(dto.consent.grantedAt),
        method: dto.consent.method,
        ipAddress: dto.consent.ipAddress,
        userAgent: dto.consent.userAgent,
        consentLanguage: dto.consent.consentLanguage,
      },
      referenceId: dto.referenceId,
    };

    // Execute the pull — translate provider errors into HTTP semantics.
    let result: CreditPullResult;
    try {
      result = await provider.pullCredit(req);
    } catch (err) {
      if (err instanceof MfsnNotConfiguredError) {
        throw new ServiceUnavailableException(err.message);
      }
      if (err instanceof MfsnUpstreamError) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }

    // Persist to audit table
    const primaryScore = result.scores[0]?.score ?? null;
    const report = this.creditReportsRepository.create({
      collectionAccountId: dto.collectionAccountId ?? dto.referenceId ?? '00000000-0000-0000-0000-000000000000',
      provider: 'myfreescorenow' as any,
      status: CreditReportStatus.SUCCESS,
      requestPayload: {
        ...req,
        ssn: req.ssn ? '***-**-****' : undefined, // never store raw SSN
        consent: req.consent,
      },
      creditScore: primaryScore,
      reportDate: result.reportDate,
      accounts: result.tradelines,
      inquiries: result.inquiries,
      publicRecords: result.publicRecords,
      warnings: result.warnings,
      rawResponse: result.rawResponse,
      notes: `Pulled via ${provider.name} for ${dto.permissiblePurpose}`,
    });

    const saved = await this.creditReportsRepository.save(report);
    this.logger.log(
      `Credit pull saved: ${saved.id} (score: ${primaryScore ?? 'N/A'}) by agent ${agentId}`,
    );

    return { report: saved, result };
  }

  /** Retrieve credit reports for a collection account */
  async getReports(collectionAccountId: string): Promise<CreditReport[]> {
    return this.creditReportsRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Get a single report (without raw response for safety) */
  async getReport(id: string): Promise<CreditReport> {
    const report = await this.creditReportsRepository.findOne({ where: { id } });
    if (!report) throw new NotFoundException(`Credit report ${id} not found`);
    // Strip raw response for API responses — only staff with elevated perms should see raw
    return { ...report, rawResponse: undefined };
  }

  /** Check provider connectivity */
  async healthCheck(): Promise<{ provider: string; healthy: boolean }> {
    const provider = this.getProvider();
    return {
      provider: provider.name,
      healthy: await provider.healthCheck(),
    };
  }

  /**
   * Configuration status — does NOT call upstream, safe for UI hints.
   * Lets the web app show a "set up credentials" hint instead of a crash
   * when MFSN env vars are unset.
   */
  getStatus(): {
    provider: string;
    configured: boolean;
    environment: 'sandbox' | 'production';
    products: string[];
  } {
    const provider = this.getProvider();
    return {
      provider: provider.name,
      configured: provider.isConfigured(),
      environment: this.mfsnProvider.environment,
      products: ['credit_snapshot', 'funding_snapshot', '3b_report'],
    };
  }
}
