import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';
import { CollectionAccount } from '../entities/collection-account.entity';
import { PaymentPlan } from '../entities/payment-plan.entity';
import { PaymentPlanPayment } from '../entities/payment-plan-payment.entity';
import { Settlement, SettlementStatus } from '../entities/settlement.entity';
import { SettlementPayment, SettlementPaymentType, SettlementPaymentStatus } from '../entities/settlement-payment.entity';
import { Creditor } from '../entities/creditor.entity';
import { CrmClient } from '../entities/crm-client.entity';
import { CreatePortalPaymentPlanDto } from './dto/create-portal-payment-plan.dto';
import { MakeOneTimePaymentDto } from './dto/make-one-time-payment.dto';
import { CompletePortalPaymentDto } from './dto/complete-portal-payment.dto';

/**
 * House-standard FDCPA mini-Miranda — verbatim copy of the text used across
 * collection-ai / payment-processors. Do NOT reword; legal text is reused, not
 * invented. Keep in sync with DEFAULT_DISCLOSURE_TEXT in
 * payment-processors.service.ts.
 */
export const PORTAL_MINI_MIRANDA =
  'This communication is from a debt collector. This is an attempt to collect a ' +
  'debt, and any information obtained will be used for that purpose.';

export const PORTAL_PAYMENT_DISCLOSURE =
  'By submitting this payment you authorize us to charge the payment method ' +
  'provided for the amount shown. Any convenience fee, if permitted in your ' +
  'state, is disclosed and included in the total. This communication is from ' +
  'a debt collector.';

/** customFields keys used for portal link state. */
const TOKEN_FIELD = 'portalAccessToken';
const TOKEN_ISSUED_AT_FIELD = 'portalAccessTokenIssuedAt';
const TOKEN_ISSUED_BY_FIELD = 'portalAccessTokenIssuedBy';
/** customFields keys recording the most recent staff CSV export of the link. */
const EXPORTED_AT_FIELD = 'portalAccessTokenLastExportAt';
const EXPORTED_BY_FIELD = 'portalAccessTokenLastExportBy';
const EXPORT_NOTE_FIELD = 'portalAccessTokenLastExportNote';
/** customFields key recording Stripe PaymentIntent ids already credited. */
const CREDITED_PAYMENTS_FIELD = 'portalCreditedPaymentIntents';
const MAX_CREDITED_INTENTS_KEPT = 50;

export interface PortalLinkResult {
  collectionAccountId: string;
  token: string;
  url: string;
  issuedAt: string;
  rotated: boolean;
}

/** One row of a staff portal-link CSV export batch. */
export interface PortalLinkExportRow {
  collectionAccountId: string;
  accountNumber?: string;
  debtorName?: string;
  debtorEmail?: string;
  url: string;
  token: string;
  issuedAt: string;
  /** Links do not expire — revoke or rotate to invalidate. */
  expiresAt: string;
  /** 'minted_on_export' | 'existing' */
  linkState: string;
}

export interface PortalLinkExportBatch {
  rows: PortalLinkExportRow[];
  minted: number;
  skipped: { accountId: string; reason: string }[];
}

@Injectable()
export class PaymentPortalService {
  private readonly logger = new Logger(PaymentPortalService.name);
  private stripeClient?: Stripe;

  /**
   * Lazily built Stripe client — env-only (no literal fallback).
   * Fails closed with a clear error when STRIPE_SECRET_KEY is unset.
   */
  private get stripe(): Stripe {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      this.logger.error('STRIPE_SECRET_KEY is not configured — portal payment calls will fail.');
      throw new BadRequestException('Payments are not configured');
    }
    if (!this.stripeClient) {
      this.stripeClient = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    }
    return this.stripeClient;
  }

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
    @InjectRepository(Creditor)
    private readonly creditorsRepository: Repository<Creditor>,
    @InjectRepository(CrmClient)
    private readonly crmClientsRepository: Repository<CrmClient>,
  ) {}

  // ---------------------------------------------------------------------------
  // Portal link issuance (staff-side — minting only, never sends)
  // ---------------------------------------------------------------------------

  /** Absolute debtor-facing URL for a minted token. */
  portalUrlFor(token: string): string {
    const base = (
      this.configService.get<string>('FRONTEND_URL') || 'https://settleinpeace.com'
    ).replace(/\/+$/, '');
    return `${base}/pay/${token}`;
  }

  /**
   * Mint (or return the existing) portal access token for a collection account.
   * The token is an unguessable random bearer credential stored in
   * customFields.portalAccessToken — the public /portal/pay/:token routes key
   * off it. Pass rotate=true to invalidate a previously issued link.
   */
  async issuePortalToken(
    collectionAccountId: string,
    issuedBy?: string,
    rotate = false,
  ): Promise<PortalLinkResult> {
    const account = await this.accountsRepository.findOne({
      where: { id: collectionAccountId },
    });
    if (!account) throw new NotFoundException('Collection account not found');

    const fields = { ...(account.customFields ?? {}) };
    const existing = fields[TOKEN_FIELD];

    if (existing && !rotate) {
      return {
        collectionAccountId,
        token: existing,
        url: this.portalUrlFor(existing),
        issuedAt: fields[TOKEN_ISSUED_AT_FIELD] ?? account.updatedAt.toISOString(),
        rotated: false,
      };
    }

    const token = randomBytes(32).toString('base64url'); // 43 chars, 256 bits
    const issuedAt = new Date().toISOString();
    fields[TOKEN_FIELD] = token;
    fields[TOKEN_ISSUED_AT_FIELD] = issuedAt;
    if (issuedBy) fields[TOKEN_ISSUED_BY_FIELD] = issuedBy;
    account.customFields = fields;
    await this.accountsRepository.save(account);

    return {
      collectionAccountId,
      token,
      url: this.portalUrlFor(token),
      issuedAt,
      rotated: Boolean(existing),
    };
  }

  /** Invalidate a previously issued portal link. */
  async revokePortalToken(collectionAccountId: string): Promise<{ revoked: boolean }> {
    const account = await this.accountsRepository.findOne({
      where: { id: collectionAccountId },
    });
    if (!account) throw new NotFoundException('Collection account not found');

    const fields = { ...(account.customFields ?? {}) };
    const had = Boolean(fields[TOKEN_FIELD]);
    delete fields[TOKEN_FIELD];
    delete fields[TOKEN_ISSUED_AT_FIELD];
    delete fields[TOKEN_ISSUED_BY_FIELD];
    account.customFields = fields;
    await this.accountsRepository.save(account);
    return { revoked: had };
  }

  // ---------------------------------------------------------------------------
  // Batch export (staff-side — CSV rows for manual delivery, never sends)
  // ---------------------------------------------------------------------------

  /**
   * Gather portal-link rows for a batch of collection accounts. Accounts
   * without a live link get one minted (rotate=false — an existing link is
   * never silently rotated by an export). Each exported account is stamped
   * in customFields with who exported it and when. This method only
   * produces data — delivery of the links is a human/compliance decision
   * made outside the platform.
   */
  async exportPortalLinkBatch(
    accountIds: string[],
    exportedBy: string,
    staffNote?: string,
  ): Promise<PortalLinkExportBatch> {
    const rows: PortalLinkExportRow[] = [];
    const skipped: { accountId: string; reason: string }[] = [];
    let minted = 0;
    const exportedAt = new Date().toISOString();

    for (const accountId of accountIds) {
      const account = await this.accountsRepository.findOne({
        where: { id: accountId },
      });
      if (!account) {
        skipped.push({ accountId, reason: 'not_found' });
        continue;
      }

      const hadToken = Boolean(account.customFields?.[TOKEN_FIELD]);
      const link = await this.issuePortalToken(accountId, exportedBy, false);
      if (!hadToken) minted += 1;

      const client = account.crmClientId
        ? await this.crmClientsRepository.findOne({
            where: { id: account.crmClientId },
          })
        : null;

      // Stamp the export on the account itself so the audit trail lives on
      // the record, not only in notes.
      const fresh = await this.accountsRepository.findOne({
        where: { id: accountId },
      });
      if (fresh) {
        const fields = { ...(fresh.customFields ?? {}) };
        fields[EXPORTED_AT_FIELD] = exportedAt;
        fields[EXPORTED_BY_FIELD] = exportedBy;
        if (staffNote) fields[EXPORT_NOTE_FIELD] = staffNote;
        fresh.customFields = fields;
        await this.accountsRepository.save(fresh);
      }

      rows.push({
        collectionAccountId: accountId,
        accountNumber: account.accountNumber,
        debtorName: client
          ? `${client.firstName} ${client.lastName}`.trim()
          : undefined,
        debtorEmail: client?.email,
        url: link.url,
        token: link.token,
        issuedAt: link.issuedAt,
        expiresAt: '', // links do not expire; revoke/rotate invalidates
        linkState: hadToken ? 'existing' : 'minted_on_export',
      });
    }

    return { rows, minted, skipped };
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
  // Account summary — PUBLIC payload, whitelisted fields only.
  // Never return the raw CollectionAccount: customFields carries the portal
  // token itself plus internal flags (vulnerability, outreach, skip-trace…).
  // ---------------------------------------------------------------------------

  async getAccountSummary(collectionAccountId: string): Promise<{
    account: {
      accountNumber?: string;
      status: CollectionAccount['status'];
      originalBalance: number;
      currentBalance: number;
      lastPaymentDate?: string;
    };
    creditorName?: string;
    debtorFirstName?: string;
    activePlans: Array<Record<string, any>>;
    nextPaymentDue: Record<string, any> | null;
    miniMiranda: string;
    paymentDisclosure: string;
  }> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    const [creditor, client, activePlans] = await Promise.all([
      account.creditorId
        ? this.creditorsRepository.findOne({ where: { id: account.creditorId } })
        : Promise.resolve(null),
      account.crmClientId
        ? this.crmClientsRepository.findOne({ where: { id: account.crmClientId } })
        : Promise.resolve(null),
      this.plansRepository.find({
        where: { collectionAccountId, status: 'active' },
      }),
    ]);

    let nextPaymentDue: Record<string, any> | null = null;
    if (activePlans.length > 0) {
      const planIds = activePlans.map((p) => p.id);
      const due = await this.planPaymentsRepository
        .createQueryBuilder('payment')
        .where('payment.paymentPlanId IN (:...planIds)', { planIds })
        .andWhere('payment.status = :status', { status: 'scheduled' })
        .orderBy('payment.scheduledDate', 'ASC')
        .getOne();
      if (due) {
        nextPaymentDue = {
          amount: Number(due.amount),
          scheduledDate: due.scheduledDate,
          installmentNumber: due.installmentNumber,
        };
      }
    }

    return {
      account: {
        accountNumber: account.accountNumber,
        status: account.status,
        originalBalance: Number(account.originalBalance),
        currentBalance: Number(account.currentBalance),
        lastPaymentDate: account.lastPaymentDate,
      },
      creditorName: creditor?.name,
      debtorFirstName: client?.firstName,
      activePlans: activePlans.map((p) => this.toPublicPlan(p)),
      nextPaymentDue,
      miniMiranda: PORTAL_MINI_MIRANDA,
      paymentDisclosure: PORTAL_PAYMENT_DISCLOSURE,
    };
  }

  private toPublicPlan(p: PaymentPlan): Record<string, any> {
    return {
      id: p.id,
      totalAmount: Number(p.totalAmount),
      paymentAmount: Number(p.paymentAmount),
      frequency: p.frequency,
      numberOfPayments: p.numberOfPayments,
      paymentsMade: p.paymentsMade,
      totalPaid: Number(p.totalPaid),
      remainingBalance: Number(p.remainingBalance),
      nextPaymentDate: p.nextPaymentDate,
      status: p.status,
    };
  }

  // ---------------------------------------------------------------------------
  // Payment options
  // ---------------------------------------------------------------------------

  async getPaymentOptions(collectionAccountId: string): Promise<{
    paymentPlans: Array<Record<string, any>>;
    settlementOffers: Array<Record<string, any>>;
    oneTimePaymentAvailable: boolean;
  }> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    const paymentPlans = await this.plansRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
    });

    // Find any settlement offers (accepted or offer_made) for this account's client.
    // Whitelisted fields only — Settlement carries internal negotiation_history/notes.
    const settlementOffers = account.crmClientId
      ? await this.settlementsRepository.find({
          where: { clientId: account.crmClientId },
          order: { createdAt: 'DESC' },
        })
      : [];

    // One-time payment is always available if there is a balance
    const oneTimePaymentAvailable = Number(account.currentBalance) > 0;

    return {
      paymentPlans: paymentPlans.map((p) => this.toPublicPlan(p)),
      settlementOffers: settlementOffers.map((s) => ({
        id: s.id,
        status: s.status,
        offeredAmount: Number(s.offeredAmount),
        settlementAmount: s.settlementAmount != null ? Number(s.settlementAmount) : null,
        settlementPercent: s.settlementPercent != null ? Number(s.settlementPercent) : null,
        offerDate: s.offerDate,
        acceptanceDate: s.acceptanceDate,
      })),
      oneTimePaymentAvailable,
    };
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
    status?: string;
    clientSecret?: string;
    paymentIntentId?: string;
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
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: {
          collectionAccountId,
          type: 'one_time_payment',
          amount: dto.amount.toString(),
        },
      });

      if (paymentIntent.status === 'succeeded') {
        await this.creditPayment(account, paymentIntent.id, Number(dto.amount));
        return {
          success: true,
          stripeChargeId: paymentIntent.id,
          amount: Number(dto.amount),
          status: 'succeeded',
        };
      }

      // Card requires authentication (3DS/SCA): the client completes it with
      // stripe.confirmCardPayment(clientSecret), then calls /payment/complete
      // which credits the balance only after Stripe reports succeeded.
      if (paymentIntent.status === 'requires_action' && paymentIntent.client_secret) {
        return {
          success: false,
          status: 'requires_action',
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: Number(dto.amount),
        };
      }

      // Any other status means the charge did not complete — never credit.
      this.logger.warn(
        `Portal one-time payment for account ${collectionAccountId} ended as PI ${paymentIntent.id} status=${paymentIntent.status}`,
      );
      throw new BadRequestException(
        `Payment could not be completed (status: ${paymentIntent.status}). No charge was credited.`,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`One-time payment failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException(`Payment failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Credit a previously-confirmed PaymentIntent against the account balance —
   * used after a client-side 3DS confirmation. Idempotent: each PaymentIntent
   * id is credited at most once (tracked in customFields).
   */
  async completeOneTimePayment(
    collectionAccountId: string,
    dto: CompletePortalPaymentDto,
  ): Promise<{ success: boolean; amount: number; alreadyCredited: boolean }> {
    const account = await this.accountsRepository.findOne({ where: { id: collectionAccountId } });
    if (!account) throw new NotFoundException('Collection account not found');

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await this.stripe.paymentIntents.retrieve(dto.paymentIntentId);
    } catch (err: any) {
      throw new BadRequestException('Payment could not be verified');
    }

    if (paymentIntent.metadata?.collectionAccountId !== collectionAccountId) {
      throw new BadRequestException('Payment does not belong to this account');
    }
    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(
        `Payment has not completed (status: ${paymentIntent.status})`,
      );
    }

    const credited: string[] = account.customFields?.[CREDITED_PAYMENTS_FIELD] ?? [];
    if (credited.includes(paymentIntent.id)) {
      return { success: true, amount: paymentIntent.amount / 100, alreadyCredited: true };
    }

    const amount = paymentIntent.amount / 100;
    await this.creditPayment(account, paymentIntent.id, amount);
    return { success: true, amount, alreadyCredited: false };
  }

  /**
   * Apply a successful Stripe PaymentIntent to the account: decrement balance,
   * stamp lastPaymentDate, and record the PI id so it can never double-credit.
   */
  private async creditPayment(
    account: CollectionAccount,
    paymentIntentId: string,
    amount: number,
  ): Promise<void> {
    const fields = { ...(account.customFields ?? {}) };
    const credited: string[] = fields[CREDITED_PAYMENTS_FIELD] ?? [];
    if (credited.includes(paymentIntentId)) return; // idempotent guard

    account.currentBalance = Math.max(0, Number(account.currentBalance) - amount);
    account.lastPaymentDate = new Date().toISOString().split('T')[0];
    fields[CREDITED_PAYMENTS_FIELD] = [...credited, paymentIntentId].slice(-MAX_CREDITED_INTENTS_KEPT);
    account.customFields = fields;
    await this.accountsRepository.save(account);
  }

  // ---------------------------------------------------------------------------
  // Payment history
  // ---------------------------------------------------------------------------

  async getPaymentHistory(collectionAccountId: string): Promise<{
    planPayments: Array<Record<string, any>>;
    settlementPayments: Array<Record<string, any>>;
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

    // Whitelisted fields only — these rows carry processor refs + internal
    // approval/notes columns that don't belong on a debtor-facing payload.
    return {
      planPayments: planPayments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        scheduledDate: p.scheduledDate,
        paidDate: p.paidDate,
        installmentNumber: p.installmentNumber,
        status: p.status,
      })),
      settlementPayments: settlementPayments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        scheduledDate: p.scheduledDate,
        processedDate: p.processedDate,
        status: p.status,
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
      })),
    };
  }
}
