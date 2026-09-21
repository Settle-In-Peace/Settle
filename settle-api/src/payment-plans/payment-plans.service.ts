import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, LessThan, MoreThan } from 'typeorm';
import { PaymentPlan } from '../entities/payment-plan.entity';
import { PaymentPlanPayment } from '../entities/payment-plan-payment.entity';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { UpdatePaymentPlanDto } from './dto/update-payment-plan.dto';
import { FilterPaymentPlanDto } from './dto/filter-payment-plan.dto';
import { FilterPaymentPlanPaymentDto } from './dto/filter-payment-plan-payment.dto';

@Injectable()
export class PaymentPlansService {
  constructor(
    @InjectRepository(PaymentPlan)
    private readonly plansRepository: Repository<PaymentPlan>,
    @InjectRepository(PaymentPlanPayment)
    private readonly paymentsRepository: Repository<PaymentPlanPayment>,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  private calculateEndDate(startDate: Date, frequency: string, numberOfPayments: number): Date {
    let date = new Date(startDate);
    for (let i = 0; i < numberOfPayments; i++) {
      date = this.addInterval(date, frequency);
    }
    return date;
  }

  // ---------------------------------------------------------------------------
  // Plan CRUD
  // ---------------------------------------------------------------------------

  async createPlan(collectionAccountId: string, dto: CreatePaymentPlanDto): Promise<PaymentPlan> {
    const startDate = new Date(dto.startDate);
    const downPayment = dto.downPayment ?? 0;
    const frequency = dto.frequency ?? 'monthly';
    const endDate = this.calculateEndDate(startDate, frequency, dto.numberOfPayments);
    const remainingBalance = Number(dto.totalAmount) - Number(downPayment);

    const plan = this.plansRepository.create({
      collectionAccountId,
      crmClientId: dto.crmClientId,
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
      paymentMethod: dto.paymentMethod,
      stripePaymentMethodId: dto.stripePaymentMethodId,
      autoPay: dto.autoPay ?? false,
      notes: dto.notes,
      customFields: dto.customFields,
    });

    const savedPlan = await this.plansRepository.save(plan);

    // Create all scheduled payment records.
    // If there is a down payment, installment 1 is the down payment on the start date.
    // The remaining installments follow the frequency schedule.
    const payments: PaymentPlanPayment[] = [];
    let scheduledDate = new Date(startDate);

    if (Number(downPayment) > 0) {
      payments.push(
        this.paymentsRepository.create({
          paymentPlanId: savedPlan.id,
          installmentNumber: 1,
          scheduledDate: new Date(startDate),
          amount: Number(downPayment),
          status: 'scheduled',
        }),
      );
      scheduledDate = this.addInterval(scheduledDate, frequency);
    }

    const remainingInstallments = Number(downPayment) > 0 ? dto.numberOfPayments : dto.numberOfPayments;
    const startInstallment = Number(downPayment) > 0 ? 2 : 1;

    for (let i = 0; i < remainingInstallments; i++) {
      payments.push(
        this.paymentsRepository.create({
          paymentPlanId: savedPlan.id,
          installmentNumber: startInstallment + i,
          scheduledDate: new Date(scheduledDate),
          amount: Number(dto.paymentAmount),
          status: 'scheduled',
        }),
      );
      scheduledDate = this.addInterval(scheduledDate, frequency);
    }

    await this.paymentsRepository.save(payments);

    return savedPlan;
  }

  async getPlans(filters: FilterPaymentPlanDto = {}): Promise<{ plans: PaymentPlan[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const query = this.plansRepository
      .createQueryBuilder('plan')
      .orderBy('plan.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.collectionAccountId) {
      query.andWhere('plan.collectionAccountId = :collectionAccountId', {
        collectionAccountId: filters.collectionAccountId,
      });
    }
    if (filters.status) {
      query.andWhere('plan.status = :status', { status: filters.status });
    }

    const [plans, total] = await query.getManyAndCount();
    return { plans, total, page, limit };
  }

  async getPlan(id: string): Promise<{ plan: PaymentPlan; payments: PaymentPlanPayment[] }> {
    const plan = await this.plansRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Payment plan not found');

    const payments = await this.paymentsRepository.find({
      where: { paymentPlanId: id },
      order: { installmentNumber: 'ASC' },
    });

    return { plan, payments };
  }

  async updatePlan(id: string, dto: UpdatePaymentPlanDto): Promise<PaymentPlan> {
    const plan = await this.plansRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Payment plan not found');

    const updated = this.plansRepository.merge(plan, dto);
    return this.plansRepository.save(updated);
  }

  // ---------------------------------------------------------------------------
  // Payment operations
  // ---------------------------------------------------------------------------

  async getPlanPayments(
    planId: string,
    filters: FilterPaymentPlanPaymentDto = {},
  ): Promise<{ payments: PaymentPlanPayment[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const query = this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.paymentPlanId = :planId', { planId })
      .orderBy('payment.installmentNumber', 'ASC')
      .skip(skip)
      .take(limit);

    if (filters.status) {
      query.andWhere('payment.status = :status', { status: filters.status });
    }

    const [payments, total] = await query.getManyAndCount();
    return { payments, total, page, limit };
  }

  async processPayment(
    planId: string,
    paymentId: string,
    stripeChargeId?: string,
    stripeTransactionId?: string,
  ): Promise<PaymentPlanPayment> {
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Payment plan not found');

    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId, paymentPlanId: planId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status === 'paid') {
      throw new BadRequestException('Payment has already been processed');
    }

    // Mark payment as paid
    payment.status = 'paid';
    payment.paidDate = new Date();
    if (stripeChargeId) payment.stripeChargeId = stripeChargeId;
    if (stripeTransactionId) payment.stripeTransactionId = stripeTransactionId;

    const savedPayment = await this.paymentsRepository.save(payment);

    // Update plan totals
    plan.paymentsMade += 1;
    plan.totalPaid = Number(plan.totalPaid) + Number(payment.amount);
    plan.remainingBalance = Number(plan.remainingBalance) - Number(payment.amount);

    // If the plan was pending, mark it active on first payment
    if (plan.status === 'pending') {
      plan.status = 'active';
    }

    // Find the next scheduled payment to update nextPaymentDate
    const nextScheduled = await this.paymentsRepository.findOne({
      where: { paymentPlanId: planId, status: 'scheduled' },
      order: { scheduledDate: 'ASC' },
    });
    plan.nextPaymentDate = nextScheduled ? nextScheduled.scheduledDate : null;

    // If all payments are made, mark plan as completed
    if (plan.paymentsMade >= plan.numberOfPayments + (Number(plan.downPayment) > 0 ? 1 : 0)) {
      plan.status = 'completed';
    }

    await this.plansRepository.save(plan);

    return savedPayment;
  }

  async failPayment(planId: string, paymentId: string, reason?: string): Promise<PaymentPlanPayment> {
    const plan = await this.plansRepository.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Payment plan not found');

    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId, paymentPlanId: planId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    payment.status = 'failed';
    payment.failureReason = reason || 'Payment failed';
    payment.retryCount = (payment.retryCount ?? 0) + 1;

    return this.paymentsRepository.save(payment);
  }

  // ---------------------------------------------------------------------------
  // Scheduling helpers (for cron/reminder system)
  // ---------------------------------------------------------------------------

  async getUpcomingPayments(days: number): Promise<PaymentPlanPayment[]> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    return this.paymentsRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.paymentPlanId', 'plan')
      .where('payment.status = :status', { status: 'scheduled' })
      .andWhere('payment.scheduledDate >= :now', { now })
      .andWhere('payment.scheduledDate <= :future', { future })
      .orderBy('payment.scheduledDate', 'ASC')
      .getMany();
  }

  async getOverduePayments(): Promise<PaymentPlanPayment[]> {
    const now = new Date();

    return this.paymentsRepository
      .createQueryBuilder('payment')
      .where('payment.status = :status', { status: 'scheduled' })
      .andWhere('payment.scheduledDate < :now', { now })
      .orderBy('payment.scheduledDate', 'ASC')
      .getMany();
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  async getPlanStats(collectionAccountId: string): Promise<{
    totalPlans: number;
    activePlans: number;
    totalOwed: number;
    totalPaid: number;
    remainingBalance: number;
  }> {
    const plans = await this.plansRepository.find({
      where: { collectionAccountId },
    });

    const totalPlans = plans.length;
    const activePlans = plans.filter((p) => p.status === 'active').length;
    const totalOwed = plans.reduce((sum, p) => sum + Number(p.totalAmount), 0);
    const totalPaid = plans.reduce((sum, p) => sum + Number(p.totalPaid), 0);
    const remainingBalance = plans.reduce((sum, p) => sum + Number(p.remainingBalance), 0);

    return { totalPlans, activePlans, totalOwed, totalPaid, remainingBalance };
  }
}
