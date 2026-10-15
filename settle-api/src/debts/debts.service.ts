import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Debt } from '../entities/debt.entity';
import { ClientEnrollment } from '../entities/client-enrollment.entity';

@Injectable()
export class DebtsService {
  constructor(
    @InjectRepository(Debt)
    private debtsRepository: Repository<Debt>,
    @InjectRepository(ClientEnrollment)
    private enrollmentsRepository: Repository<ClientEnrollment>,
  ) {}

  async createDebt(userId: string, debtData: Partial<Debt>) {
    const debt = this.debtsRepository.create({
      ...debtData,
      userId,
      originalBalance: debtData.balance,
      status: 'active',
    });
    return this.debtsRepository.save(debt);
  }

  async getUserDebts(userId: string) {
    return this.debtsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getDebtById(id: string, userId: string) {
    const debt = await this.debtsRepository.findOne({ where: { id, userId } });
    if (!debt) {
      throw new NotFoundException('Debt not found');
    }
    return debt;
  }

  async updateDebt(id: string, userId: string, updateData: Partial<Debt>) {
    const debt = await this.getDebtById(id, userId);
    await this.debtsRepository.update(id, updateData);
    return this.debtsRepository.findOne({ where: { id } });
  }

  async deleteDebt(id: string, userId: string) {
    const debt = await this.getDebtById(id, userId);
    await this.debtsRepository.delete(id);
    return { message: 'Debt deleted successfully' };
  }

  async getTotalDebt(userId: string) {
    const debts = await this.getUserDebts(userId);
    return debts.reduce((total, debt) => total + Number(debt.balance), 0);
  }

  async getDebtSummary(userId: string) {
    const debts = await this.getUserDebts(userId);
    const totalDebt = debts.reduce((total, debt) => total + Number(debt.balance), 0);
    const totalOriginal = debts.reduce((total, debt) => total + Number(debt.originalBalance || debt.balance), 0);
    
    const byType = debts.reduce((acc, debt) => {
      acc[debt.type] = (acc[debt.type] || 0) + Number(debt.balance);
      return acc;
    }, {} as Record<string, number>);

    const byStatus = debts.reduce((acc, debt) => {
      acc[debt.status] = (acc[debt.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalDebt,
      totalOriginal,
      totalSaved: totalOriginal - totalDebt,
      debtCount: debts.length,
      byType,
      byStatus,
    };
  }

  /**
   * Consumer-facing payoff progress — the retention surface. Combines the
   * caller's own debts rollup with their admin-managed program enrollment
   * (crm_enrollments.userId) when one exists: percent settled, program
   * month counter, per-account paydown, and the next milestone to hit.
   */
  async getProgress(userId: string) {
    const debts = await this.getUserDebts(userId);
    const totalDebt = debts.reduce((t, d) => t + Number(d.balance), 0);
    const totalOriginal = debts.reduce(
      (t, d) => t + Number(d.originalBalance || d.balance),
      0,
    );

    const accounts = debts.map((d) => {
      const original = Number(d.originalBalance || d.balance);
      const paidDown = Math.max(0, original - Number(d.balance));
      return {
        id: d.id,
        name: d.creditor,
        type: d.type,
        status: d.status,
        balance: Number(d.balance),
        originalBalance: original,
        paidDown,
        percentPaid:
          original > 0 ? Math.min(100, Math.round((paidDown / original) * 100)) : 0,
      };
    });

    const enrollment = await this.enrollmentsRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    let program: Record<string, unknown> | null = null;
    if (enrollment) {
      const enrolled = Number(enrollment.totalEnrolledDebt || 0);
      const settled = Number(enrollment.totalSettledAmount || 0);
      const enrolledDate = enrollment.enrollmentDate
        ? new Date(enrollment.enrollmentDate)
        : null;
      const monthsIn = enrolledDate
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - enrolledDate.getTime()) / (30.44 * 86400_000),
            ) + 1,
          )
        : null;
      program = {
        status: enrollment.status,
        programType: enrollment.programType,
        totalEnrolledDebt: enrolled,
        totalSettledAmount: settled,
        totalSavedAmount: Number(enrollment.totalSavedAmount || 0),
        monthlyProgramPayment: Number(enrollment.monthlyProgramPayment || 0),
        programLengthMonths: enrollment.programLengthMonths,
        monthNumber: monthsIn,
        expectedCompletionDate: enrollment.expectedCompletionDate,
        accountsEnrolled: enrollment.totalAccountsEnrolled,
        accountsSettled: enrollment.totalAccountsSettled,
        percentSettled:
          enrolled > 0
            ? Math.min(100, Math.round((settled / enrolled) * 100))
            : 0,
      };
    }

    const pctPaidTotal =
      totalOriginal > 0
        ? Math.round(((totalOriginal - totalDebt) / totalOriginal) * 100)
        : 0;
    const nextMilestone = [25, 50, 75, 100].find((m) => pctPaidTotal < m) ?? null;

    return {
      summary: {
        totalDebt,
        totalOriginal,
        totalSaved: Math.max(0, totalOriginal - totalDebt),
        percentPaidDown: pctPaidTotal,
        debtCount: debts.length,
        settledCount: debts.filter((d) => d.status === 'settled').length,
        nextMilestonePct: nextMilestone,
      },
      program,
      accounts,
    };
  }
}