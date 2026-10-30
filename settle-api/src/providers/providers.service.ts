import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Provider } from '../entities/provider.entity';
import { CrmService } from '../crm/crm.service';

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);
  constructor(
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    private crmService: CrmService,
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