import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CollectionAccount } from '../entities/collection-account.entity';
import { PaymentPlan } from '../entities/payment-plan.entity';
import { PaymentPlanPayment } from '../entities/payment-plan-payment.entity';
import { Settlement, SettlementStatus } from '../entities/settlement.entity';
import { SettlementPayment, SettlementPaymentType, SettlementPaymentStatus } from '../entities/settlement-payment.entity';
import { CreatePortalPaymentPlanDto } from './dto/create-portal-payment-plan.dto';
import { MakeOneTimePaymentDto } from './dto/make-one-time-payment.dto';

@Injectable()
export class PaymentPortalService {
  private readonly logger = new Logger(PaymentPortalService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    @InjectRepository(CollectionAccount)
    private readonly accountsRepository: Repository<CollectionAccount>,
    @InjectRepository(PaymentPlan)
    private readonly plansRepository: Repository<PaymentPlan>,
    @InjectRepository(PaymentPlanPayment)
    private readonly planPaymentsRepository: Repository<PaymentPlanPayment>,
    @InjectRepository(Settlement)
    private readonly settlementsRepository: Repository<Settlement>,
    @InjectRepository(SettlementPayment)
    private readonly settlementPaymentsRepository: Repository<SettlementPayment>,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(secretKey || 'sk_test_placeholder', {
      apiVersion: '2026-06-24.dahlia',
    });
  }

  // ---------------------------------------------------------------------------
  // Token-based account lookup
  // ---------------------------------------------------------------------------

  async getAccountByToken(token: string): Promise<CollectionAccount> {
    // The secure access token is stored in the collection account's customFields.portalAccessToken.
    // This allows debtors to access their account via a unique link without JWT auth.
    const account = await this.accountsRepository
      .createQueryBuilder('account')
      .where('account.customFields ->> \'portalAccessToken\' = :token', { token })
      .getOne();

    if (!account) {
      throw new NotFoundException('Invalid or expired payment link');
    }

    return account;
  }

  // ---------------------------------------------------------------------------
  // Account summary
  // ---------------------------------------------------------------------------

  async getAccountSummary(collectionAccountId: string): Promise<{
    account: CollectionAccount;
    activePlans: PaymentPlan[];
    nextPaymentDue: PaymentPlanPayment | null;
  }> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    const activePlans = await this.plansRepository.find({
      where: { collectionAccountId, status: 'active' },
    });

    let nextPaymentDue: PaymentPlanPayment | null = null;
    if (activePlans.length > 0) {
      const planIds = activePlans.map((p) => p.id);
      nextPaymentDue = await this.planPaymentsRepository
        .createQueryBuilder('payment')
        .where('payment.paymentPlanId IN (:...planIds)', { planIds })
        .andWhere('payment.status = :status', { status: 'scheduled' })
        .orderBy('payment.scheduledDate', 'ASC')
        .getOne();
    }

    return { account, activePlans, nextPaymentDue };
  }

  // ---------------------------------------------------------------------------
  // Payment options
  // ---------------------------------------------------------------------------

  async getPaymentOptions(collectionAccountId: string): Promise<{
    paymentPlans: PaymentPlan[];
    settlementOffers: Settlement[];
    oneTimePaymentAvailable: boolean;
  }> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    const paymentPlans = await this.plansRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
    });

    // Find any settlement offers (accepted or offer_made) for this account's client
    const settlementOffers = account.crmClientId
      ? await this.settlementsRepository.find({
          where: { clientId: account.crmClientId },
          order: { createdAt: 'DESC' },
        })
      : [];

    // One-time payment is always available if there is a balance
    const oneTimePaymentAvailable = Number(account.currentBalance) > 0;

    return { paymentPlans, settlementOffers, oneTimePaymentAvailable };
  }

  // ---------------------------------------------------------------------------
  // Create payment plan (debtor self-service)
  // ---------------------------------------------------------------------------

  async createPaymentPlan(collectionAccountId: string, dto: CreatePortalPaymentPlanDto): Promise<PaymentPlan> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    const startDate = new Date(dto.startDate);
    const downPayment = dto.downPayment ?? 0;
    const frequency = dto.frequency ?? 'monthly';
    const remainingBalance = Number(dto.totalAmount) - Number(downPayment);

    // Calculate end date
    let endDate = new Date(startDate);
    for (let i = 0; i < dto.numberOfPayments; i++) {
      switch (frequency) {
        case 'weekly':
          endDate.setDate(endDate.getDate() + 7);
          break;
        case 'biweekly':
          endDate.setDate(endDate.getDate() + 14);
          break;
        case 'monthly':
        default:
          endDate.setMonth(endDate.getMonth() + 1);
          break;
      }
    }

    const plan = this.plansRepository.create({
      collectionAccountId,
      crmClientId: account.crmClientId,
      totalAmount: Number(dto.totalAmount),
      downPayment: Number(downPayment),
      numberOfPayments: dto.numberOfPayments,
      paymentAmount: Number(dto.paymentAmount),
      frequency,
      startDate,
      endDate,
      nextPaymentDate: startDate,
      paymentsMade: 0,
      totalPaid: 0,
      remainingBalance,
      status: 'pending',
      paymentMethod: dto.paymentMethod ?? 'stripe',
      stripePaymentMethodId: dto.stripePaymentMethodId,
      autoPay: dto.autoPay ?? false,
    });

    const savedPlan = await this.plansRepository.save(plan);

    // Create scheduled payment records
    const payments: PaymentPlanPayment[] = [];
    let scheduledDate = new Date(startDate);

    if (Number(downPayment) > 0) {
      payments.push(
        this.planPaymentsRepository.create({
          paymentPlanId: savedPlan.id,
          installmentNumber: 1,
          scheduledDate: new Date(startDate),
          amount: Number(downPayment),
          status: 'scheduled',
        }),
      );
      scheduledDate = new Date(startDate);
      scheduledDate = this.addInterval(scheduledDate, frequency);
    }

    const startInstallment = Number(downPayment) > 0 ? 2 : 1;
    for (let i = 0; i < dto.numberOfPayments; i++) {
      payments.push(
        this.planPaymentsRepository.create({
          paymentPlanId: savedPlan.id,
          installmentNumber: startInstallment + i,
          scheduledDate: new Date(scheduledDate),
          amount: Number(dto.paymentAmount),
          status: 'scheduled',
        }),
      );
      scheduledDate = this.addInterval(scheduledDate, frequency);
    }

    await this.planPaymentsRepository.save(payments);

    return savedPlan;
  }

  private addInterval(date: Date, frequency: string): Date {
    const result = new Date(date);
    switch (frequency) {
      case 'weekly':
        result.setDate(result.getDate() + 7);
        break;
      case 'biweekly':
        result.setDate(result.getDate() + 14);
        break;
      case 'monthly':
      default:
        result.setMonth(result.getMonth() + 1);
        break;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // One-time payment via Stripe
  // ---------------------------------------------------------------------------

  async makeOneTimePayment(collectionAccountId: string, dto: MakeOneTimePaymentDto): Promise<{
    success: boolean;
    stripeChargeId?: string;
    amount: number;
  }> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    if (Number(dto.amount) <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (Number(dto.amount) > Number(account.currentBalance)) {
      throw new BadRequestException('Payment amount exceeds current balance');
    }

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(Number(dto.amount) * 100), // Stripe expects cents
        currency: 'usd',
        payment_method: dto.stripePaymentMethodId,
        confirm: true,
        metadata: {
          collectionAccountId,
          type: 'one_time_payment',
          amount: dto.amount.toString(),
        },
      });

      // Update the account balance
      account.currentBalance = Number(account.currentBalance) - Number(dto.amount);
      account.lastPaymentDate = new Date().toISOString().split('T')[0];
      await this.accountsRepository.save(account);

      return {
        success: true,
        stripeChargeId: paymentIntent.id,
        amount: Number(dto.amount),
      };
    } catch (err: any) {
      this.logger.error(`One-time payment failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException(`Payment failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Payment history
  // ---------------------------------------------------------------------------

  async getPaymentHistory(collectionAccountId: string): Promise<{
    planPayments: PaymentPlanPayment[];
    settlementPayments: SettlementPayment[];
  }> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    // Get all payment plan payments for this account's plans
    const plans = await this.plansRepository.find({ where: { collectionAccountId } });
    const planIds = plans.map((p) => p.id);

    let planPayments: PaymentPlanPayment[] = [];
    if (planIds.length > 0) {
      planPayments = await this.planPaymentsRepository
        .createQueryBuilder('payment')
        .where('payment.paymentPlanId IN (:...planIds)', { planIds })
        .andWhere('payment.status = :status', { status: 'paid' })
        .orderBy('payment.paidDate', 'DESC')
        .getMany();
    }

    // Get settlement payments for this client
    let settlementPayments: SettlementPayment[] = [];
    if (account.crmClientId) {
      settlementPayments = await this.settlementPaymentsRepository.find({
        where: { clientId: account.crmClientId },
        order: { createdAt: 'DESC' },
      });
    }

    return { planPayments, settlementPayments };
  }
}
