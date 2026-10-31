import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Provider } from '../entities/provider.entity';
import { CrmService } from '../crm/crm.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);
  /** Password-setup links issued on approval expire after 72 hours. */
  private static readonly SETUP_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    private crmService: CrmService,
    private emailService: EmailService,
  ) {}

  /**
   * Fields a provider is allowed to set/update on their own profile.
   * Sensitive internal fields (status, creditBalance, leadPrice,
   * subscriptionType, stripe IDs, email, password) are intentionally
   * excluded — email/password changes need a dedicated verified flow, and
   * billing/status fields are admin-managed.
   */
  private static readonly SELF_SERVICE_FIELDS: (keyof Provider)[] = [
    'companyName',
    'contactName',
    'phone',
    'website',
    'logoUrl',
    'description',
    'serviceTypes',
    'debtTypes',
    'statesServed',
    'minDebtAmount',
    'maxDebtAmount',
    'feePercentage',
    'feeStructure',
    'bbbRating',
    'yearsInBusiness',
    'isAfccMember',
    'isIapdaMember',
    'isAcceptingLeads',
  ];

  /** Pick only self-service profile fields from an arbitrary payload. */
  private pickSelfServiceFields(data: Partial<Provider>): Partial<Provider> {
    const picked: Partial<Provider> = {};
    for (const key of ProvidersService.SELF_SERVICE_FIELDS) {
      if (data[key] !== undefined) {
        (picked as Record<string, unknown>)[key] = data[key];
      }
    }
    return picked;
  }

  /**
   * Strip internal/billing fields for public (unauthenticated) responses.
   * Consumers legitimately see business contact info and service details,
   * but never credit balances, Stripe IDs, subscription state, or lead pricing.
   */
  private toPublicProvider(provider: Partial<Provider>): Partial<Provider> {
    const {
      password: _password,
      stripeCustomerId: _stripeCustomerId,
      stripeSubscriptionId: _stripeSubscriptionId,
      subscriptionStatus: _subscriptionStatus,
      subscriptionTier: _subscriptionTier,
      subscriptionSeats: _subscriptionSeats,
      currentPeriodEnd: _currentPeriodEnd,
      cancelAtPeriodEnd: _cancelAtPeriodEnd,
      creditBalance: _creditBalance,
      leadPrice: _leadPrice,
      subscriptionType: _subscriptionType,
      emailVerified: _emailVerified,
      passwordSetupToken: _pst,
      passwordSetupExpires: _pse,
      planInterest: _pi,
      ...publicFields
    } = provider;
    return publicFields;
  }

  async createProvider(data: Partial<Provider> & { password: string }) {
    const existing = await this.providersRepository.findOne({ where: { email: data.email } });
    if (existing) throw new ConflictException('A provider with this email already exists');

    const hashed = await bcrypt.hash(data.password, 10);
    const provider = this.providersRepository.create({
      ...this.pickSelfServiceFields(data),
      email: data.email,
      password: hashed,
      status: 'pending',
    });
    const saved = await this.providersRepository.save(provider);
    const { password: _, ...result } = saved;

    // Sync provider to CRM as a new client/prospect
    try {
      await this.crmService.createClient({
        firstName: saved.companyName,
        lastName: 'Provider',
        email: saved.email,
        phone: saved.phone,
        company: saved.companyName,
        source: 'provider_signup',
        userId: 'system',
        groupId: saved.id,
        assignedTo: saved.id,
      });
    } catch (error) {
      this.logger.error(`CRM sync failed for provider ${saved.id}: ${error}`);
    }

    return result;
  }

  /**
   * Lightweight enrollment (POST /providers/enroll) — no password. Creates a
   * providers row in 'pending_review'; on admin approval the provider gets a
   * one-time emailed setup link to choose a password and activate portal
   * access. Also used by the partner-outreach pipeline (tools/provider-invite).
   */
  async enrollProvider(data: Partial<Provider> & { planInterest?: string }) {
    const email = (data.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Email is required');

    const existing = await this.providersRepository.findOne({ where: { email } });
    if (existing) {
      if (existing.status === 'rejected') {
        // A previously-rejected applicant may re-apply — re-open for review.
        await this.providersRepository.update(existing.id, {
          ...this.pickSelfServiceFields(data),
          planInterest: data.planInterest,
          status: 'pending_review',
        });
        const updated = await this.getProviderById(existing.id);
        return { ...this.toPublicProvider(updated), reapply: true };
      }
      throw new ConflictException('A provider with this email already exists');
    }

    const provider = this.providersRepository.create({
      ...this.pickSelfServiceFields(data),
      email,
      planInterest: data.planInterest,
      status: 'pending_review',
    });
    const saved = await this.providersRepository.save(provider);
    const result = this.toPublicProvider(saved);

    // CRM prospect record — same pattern as signup.
    try {
      await this.crmService.createClient({
        firstName: saved.contactName || saved.companyName,
        lastName: 'Provider',
        email: saved.email,
        phone: saved.phone,
        company: saved.companyName,
        source: 'provider_enroll',
        userId: 'system',
        groupId: saved.id,
        assignedTo: saved.id,
      });
    } catch (error) {
      this.logger.error(`CRM sync failed for enrolled provider ${saved.id}: ${error}`);
    }

    // Fire-and-forget confirmation — enrollment must succeed even if the
    // transactional provider is down.
    this.emailService
      .sendProviderEnrollmentReceived(saved.email, saved.companyName, saved.contactName)
      .catch((err) =>
        this.logger.error(
          `Enrollment confirmation email failed for ${saved.email}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return result;
  }

  /**
   * Anonymous-safe network stat for the public /providers page.
   * Only exposes aggregate counts — never provider records.
   */
  async getPublicCounts(): Promise<{ active: number }> {
    const active = await this.providersRepository.count({ where: { status: 'active' } });
    return { active };
  }

  /**
   * Issue a one-time password-setup token (used by admin approval when the
   * provider enrolled without a password). Returns the raw token.
   */
  async createPasswordSetupToken(providerId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.providersRepository.update(providerId, {
      passwordSetupToken: token,
      passwordSetupExpires: new Date(Date.now() + ProvidersService.SETUP_TOKEN_TTL_MS),
    });
    return token;
  }

  /**
   * Redeem a password-setup token and set the provider's portal password.
   * Reaching this endpoint proves inbox access, so the email is marked
   * verified at the same time.
   */
  async setPasswordWithToken(token: string, password: string): Promise<{ success: true }> {
    const provider = await this.providersRepository.findOne({
      where: { passwordSetupToken: token },
    });
    if (
      !provider ||
      !provider.passwordSetupExpires ||
      provider.passwordSetupExpires.getTime() < Date.now()
    ) {
      throw new BadRequestException('This setup link is invalid or has expired');
    }

    provider.password = await bcrypt.hash(password, 10);
    // Must be null, not undefined — save() skips undefined columns and the
    // token would remain redeemable forever.
    provider.passwordSetupToken = null;
    provider.passwordSetupExpires = null;
    provider.emailVerified = true;
    await this.providersRepository.save(provider);

    this.logger.log(`Provider ${provider.id} set a password via setup link`);
    return { success: true };
  }

  async getAllActiveProviders(filters?: { debtType?: string; state?: string; minDebt?: number }) {
    const qb = this.providersRepository
      .createQueryBuilder('p')
      .where('p.status = :status', { status: 'active' })
      .andWhere('p.isAcceptingLeads = true');

    if (filters?.minDebt) {
      qb.andWhere('p.minDebtAmount <= :minDebt', { minDebt: filters.minDebt });
    }

    const providers = await qb.orderBy('p.avgRating', 'DESC').getMany();
    return providers.map((p) => this.toPublicProvider(p));
  }

  async getProviderById(id: string) {
    const provider = await this.providersRepository.findOne({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');
    const { password: _, ...result } = provider;
    return result;
  }

  /** Public-safe single provider lookup (internal/billing fields stripped). */
  async getPublicProviderById(id: string) {
    const provider = await this.getProviderById(id);
    return this.toPublicProvider(provider);
  }

  async getProviderByEmail(email: string) {
    return this.providersRepository.findOne({ where: { email } });
  }

  async updateProvider(id: string, data: Partial<Provider>) {
    // Only whitelisted self-service fields may be updated through this path.
    // This prevents privilege escalation (status, creditBalance, leadPrice,
    // subscriptionType, Stripe IDs) and accidentally storing a plaintext
    // password — password/email changes require a dedicated verified flow.
    const safe = this.pickSelfServiceFields(data);
    if (Object.keys(safe).length === 0) {
      return this.getProviderById(id);
    }
    await this.providersRepository.update(id, safe);
    return this.getProviderById(id);
  }

  async deductCredit(id: string, amount: number) {
    await this.providersRepository.decrement({ id }, 'creditBalance', amount);
  }

  async addCredit(id: string, amount: number) {
    await this.providersRepository.increment({ id }, 'creditBalance', amount);
  }

  async getProviderStats(id: string) {
    const provider = await this.getProviderById(id);
    return {
      creditBalance: provider.creditBalance,
      successfulSettlements: provider.successfulSettlements,
      avgRating: provider.avgRating,
      reviewCount: provider.reviewCount,
      isAcceptingLeads: provider.isAcceptingLeads,
    };
  }
}