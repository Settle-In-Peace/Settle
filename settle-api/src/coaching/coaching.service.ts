import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Budget } from '../entities/budget.entity';
import { BudgetItem } from '../entities/budget-item.entity';
import { Goal } from '../entities/goal.entity';
import { CoachingSubscription } from '../entities/coaching-subscription.entity';
import { User } from '../entities/user.entity';
import { CreateBudgetDto, BudgetItemDto } from './dtos/create-budget.dto';
import { CreateGoalDto } from './dtos/create-goal.dto';
import { UpdateBudgetDto } from './dtos/update-budget.dto';

export interface DebtPayoffResult {
  totalDebt: number;
  monthlyPayment: number;
  interestRate: number;
  monthsToPayoff: number;
  totalInterestPaid: number;
  totalPaid: number;
  schedule: Array<{
    month: number;
    payment: number;
    principal: number;
    interest: number;
    balance: number;
  }>;
}

export interface DebtToIncomeResult {
  monthlyIncome: number;
  monthlyDebtPayments: number;
  dtiRatio: number; // percentage
  category: 'healthy' | 'manageable' | 'high' | 'critical';
  recommendation: string;
}

/** Stripe coaching-subscription statuses that unlock the coaching feature. */
export const COACHING_ENTITLED_STATUSES = new Set(['active', 'trialing']);

export interface CoachingEntitlement {
  entitled: boolean;
  status: string;
  /** True when access came from the staff/test bypass, not a paid sub. */
  bypassed: boolean;
}

@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);

  constructor(
    @InjectRepository(Budget)
    private budgetsRepository: Repository<Budget>,
    @InjectRepository(BudgetItem)
    private budgetItemsRepository: Repository<BudgetItem>,
    @InjectRepository(Goal)
    private goalsRepository: Repository<Goal>,
    @InjectRepository(CoachingSubscription)
    private coachingSubscriptionsRepository: Repository<CoachingSubscription>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Subscription entitlement
  // ---------------------------------------------------------------------------

  /**
   * Resolve whether a user may use coaching features.
   * Entitled = coaching subscription status 'active' or 'trialing', sourced
   * from the coaching_subscriptions ledger row first and the denormalized
   * users.coaching_subscription_status column as fallback (same precedence
   * as getDashboard).
   *
   * STAFF/TEST BYPASS (clearly marked): role 'admin'/'sales' accounts and
   * emails listed in the COACHING_GATE_EXEMPT_EMAILS env var (comma-separated,
   * e.g. app-store reviewer accounts) skip the paywall. Never use the
   * bypass for real consumers — it exists so staff and store reviewers can
   * exercise the feature without buying a subscription.
   */
  async resolveEntitlement(userId: string): Promise<CoachingEntitlement> {
    const [user, subscription] = await Promise.all([
      this.usersRepository.findOne({ where: { id: userId } }),
      this.coachingSubscriptionsRepository.findOne({
        where: { userId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const status =
      subscription?.status || user?.coachingSubscriptionStatus || 'inactive';

    const bypassed = this.isExemptUser(user);
    return {
      entitled: bypassed || COACHING_ENTITLED_STATUSES.has(status),
      status,
      bypassed,
    };
  }

  /**
   * Staff/test paywall bypass — internal staff roles plus the
   * COACHING_GATE_EXEMPT_EMAILS allowlist (review/test accounts).
   */
  private isExemptUser(user: User | null): boolean {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'sales') return true;
    const exemptEmails = (
      this.configService.get<string>('COACHING_GATE_EXEMPT_EMAILS') || ''
    )
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    return exemptEmails.includes((user.email || '').toLowerCase());
  }

  // ---------------------------------------------------------------------------
  // Budgets
  // ---------------------------------------------------------------------------

  async createBudget(userId: string, dto: CreateBudgetDto): Promise<Budget> {
    const budget = this.budgetsRepository.create({
      userId,
      monthlyIncome: dto.monthlyIncome,
      expenses: (dto.expenses || []).map((item) =>
        this.budgetItemsRepository.create({
          name: item.name,
          amount: item.amount,
          category: item.category || 'other',
          recurring: item.recurring ?? false,
        }),
      ),
    });

    return this.budgetsRepository.save(budget);
  }

  async getBudgets(userId: string): Promise<Budget[]> {
    return this.budgetsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateBudget(
    userId: string,
    budgetId: string,
    dto: UpdateBudgetDto,
  ): Promise<Budget> {
    const budget = await this.budgetsRepository.findOne({
      where: { id: budgetId, userId },
    });
    if (!budget) throw new NotFoundException('Budget not found');

    return this.dataSource.transaction(async (manager) => {
      if (dto.monthlyIncome !== undefined) {
        budget.monthlyIncome = dto.monthlyIncome;
      }

      if (dto.expenses !== undefined) {
        // Replace existing items: delete all current items and insert new ones.
        await manager.delete(BudgetItem, { budgetId });

        const newItems = dto.expenses.map((item) =>
          manager.create(BudgetItem, {
            budgetId,
            name: item.name,
            amount: item.amount,
            category: item.category || 'other',
            recurring: item.recurring ?? false,
          }),
        );

        const savedItems = await manager.save(BudgetItem, newItems);
        budget.expenses = savedItems;
      }

      return manager.save(Budget, budget);
    });
  }

  async deleteBudget(userId: string, budgetId: string): Promise<void> {
    const budget = await this.budgetsRepository.findOne({
      where: { id: budgetId, userId },
    });
    if (!budget) throw new NotFoundException('Budget not found');

    await this.budgetsRepository.remove(budget);
  }

  // ---------------------------------------------------------------------------
  // Goals
  // ---------------------------------------------------------------------------

  async createGoal(userId: string, dto: CreateGoalDto): Promise<Goal> {
    const goal = this.goalsRepository.create({
      userId,
      title: dto.title,
      targetAmount: dto.targetAmount,
      currentAmount: dto.currentAmount ?? 0,
      type: dto.type || 'savings',
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
    });

    const saved = await this.goalsRepository.save(goal);
    return this.refreshGoalCompletion(saved);
  }

  async getGoals(userId: string): Promise<Goal[]> {
    return this.goalsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateGoalProgress(
    userId: string,
    goalId: string,
    currentAmount: number,
  ): Promise<Goal> {
    const goal = await this.goalsRepository.findOne({
      where: { id: goalId, userId },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    if (currentAmount < 0) {
      throw new BadRequestException('Current amount cannot be negative');
    }

    goal.currentAmount = currentAmount;
    goal.completed = Number(currentAmount) >= Number(goal.targetAmount);

    const saved = await this.goalsRepository.save(goal);
    return this.refreshGoalCompletion(saved);
  }

  async deleteGoal(userId: string, goalId: string): Promise<void> {
    const goal = await this.goalsRepository.findOne({
      where: { id: goalId, userId },
    });
    if (!goal) throw new NotFoundException('Goal not found');

    await this.goalsRepository.remove(goal);
  }

  // ---------------------------------------------------------------------------
  // Subscription status
  // ---------------------------------------------------------------------------

  /**
   * Resolves the user's coaching subscription state. The latest
   * `coaching_subscriptions` row wins; `user.coachingSubscriptionStatus`
   * (maintained by the Stripe webhook handlers) is the fallback.
   * `active` is entitlement-aware — staff/test bypass accounts read as
   * active so clients render the tools instead of the paywall.
   */
  async getSubscriptionStatus(userId: string) {
    const [subscription, user, entitlement] = await Promise.all([
      this.coachingSubscriptionsRepository.findOne({
        where: { userId },
        order: { createdAt: 'DESC' },
      }),
      this.usersRepository.findOne({ where: { id: userId } }),
      this.resolveEntitlement(userId),
    ]);

    const status =
      subscription?.status || user?.coachingSubscriptionStatus || 'inactive';

    return {
      status,
      active: entitlement.entitled,
      stripeSubscriptionId:
        subscription?.stripeSubscriptionId || user?.stripeSubscriptionId || null,
      startedAt: subscription?.startedAt || null,
      canceledAt: subscription?.canceledAt || null,
    };
  }

  /**
   * Whether the user may use the gated coaching tools (budgets, goals,
   * dashboard, calculators). Includes the staff/test bypass — see
   * resolveEntitlement.
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const { entitled } = await this.resolveEntitlement(userId);
    return entitled;
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  /**
   * Dashboard stays reachable for every signed-in user (it carries the
   * subscription block the apps use to render subscribe/manage UI), but the
   * budget/goal payloads are stripped unless the caller is entitled — same
   * field-masking convention as matching.service contact gating.
   */
  async getDashboard(userId: string) {
    const subscription = await this.getSubscriptionStatus(userId);

    if (!subscription.active) {
      return {
        entitled: false,
        budgets: [],
        goals: [],
        subscription,
        summary: {
          totalMonthlyIncome: 0,
          totalMonthlyExpenses: 0,
          netMonthly: 0,
          activeGoals: 0,
          completedGoals: 0,
          totalGoals: 0,
        },
      };
    }

    const [budgets, goals] = await Promise.all([
      this.getBudgets(userId),
      this.getGoals(userId),
    ]);

    // Aggregate budget summary
    const totalMonthlyExpenses = budgets.reduce((sum, budget) => {
      const expenses = (budget.expenses || []).reduce(
        (itemSum, item) => itemSum + Number(item.amount),
        0,
      );
      return sum + expenses;
    }, 0);

    const totalMonthlyIncome = budgets.reduce(
      (sum, budget) => sum + Number(budget.monthlyIncome),
      0,
    );

    const activeGoals = goals.filter((g) => !g.completed).length;
    const completedGoals = goals.filter((g) => g.completed).length;

    return {
      entitled: true,
      budgets,
      goals,
      subscription,
      summary: {
        totalMonthlyIncome,
        totalMonthlyExpenses,
        netMonthly: totalMonthlyIncome - totalMonthlyExpenses,
        activeGoals,
        completedGoals,
        totalGoals: goals.length,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Calculators
  // ---------------------------------------------------------------------------

  calculateDebtPayoff(
    userId: string,
    totalDebt: number,
    monthlyPayment: number,
    interestRate: number,
  ): DebtPayoffResult {
    if (totalDebt <= 0) {
      throw new BadRequestException('Total debt must be greater than zero');
    }
    if (monthlyPayment <= 0) {
      throw new BadRequestException('Monthly payment must be greater than zero');
    }
    if (interestRate < 0) {
      throw new BadRequestException('Interest rate cannot be negative');
    }

    // Monthly interest rate (APR converted to monthly)
    const monthlyRate = interestRate / 100 / 12;

    // If the monthly payment does not cover the first month's interest, the
    // debt will never be paid off.
    const firstMonthInterest = totalDebt * monthlyRate;
    if (monthlyRate > 0 && monthlyPayment <= firstMonthInterest) {
      throw new BadRequestException(
        'Monthly payment is too low to cover interest. Increase the payment to make progress on the principal.',
      );
    }

    let balance = totalDebt;
    let totalInterestPaid = 0;
    let month = 0;
    const schedule: DebtPayoffResult['schedule'] = [];

    // Cap iterations to prevent infinite loops in edge cases.
    const maxMonths = 1200; // 100 years

    while (balance > 0 && month < maxMonths) {
      month += 1;
      const interest = balance * monthlyRate;
      let principal = monthlyPayment - interest;

      // Final payment may be smaller than the scheduled payment.
      if (principal >= balance) {
        principal = balance;
        const payment = principal + interest;
        totalInterestPaid += interest;
        balance = 0;
        schedule.push({
          month,
          payment: Number(payment.toFixed(2)),
          principal: Number(principal.toFixed(2)),
          interest: Number(interest.toFixed(2)),
          balance: 0,
        });
        break;
      }

      balance -= principal;
      totalInterestPaid += interest;
      schedule.push({
        month,
        payment: Number(monthlyPayment.toFixed(2)),
        principal: Number(principal.toFixed(2)),
        interest: Number(interest.toFixed(2)),
        balance: Number(balance.toFixed(2)),
      });
    }

    const totalPaid = totalDebt + totalInterestPaid;

    return {
      totalDebt: Number(totalDebt.toFixed(2)),
      monthlyPayment: Number(monthlyPayment.toFixed(2)),
      interestRate,
      monthsToPayoff: month,
      totalInterestPaid: Number(totalInterestPaid.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      schedule,
    };
  }

  calculateDebtToIncome(
    monthlyIncome: number,
    monthlyDebtPayments: number,
  ): DebtToIncomeResult {
    if (monthlyIncome <= 0) {
      throw new BadRequestException('Monthly income must be greater than zero');
    }
    if (monthlyDebtPayments < 0) {
      throw new BadRequestException('Monthly debt payments cannot be negative');
    }

    const dtiRatio = (monthlyDebtPayments / monthlyIncome) * 100;

    let category: DebtToIncomeResult['category'];
    let recommendation: string;

    if (dtiRatio <= 20) {
      category = 'healthy';
      recommendation =
        'Your debt-to-income ratio is excellent. You have plenty of room in your budget and are in a strong position to save or invest.';
    } else if (dtiRatio <= 36) {
      category = 'manageable';
      recommendation =
        'Your debt-to-income ratio is within a healthy range. Continue managing your debt and consider directing surplus funds toward an emergency fund.';
    } else if (dtiRatio <= 43) {
      category = 'high';
      recommendation =
        'Your debt-to-income ratio is elevated. Lenders typically prefer a DTI below 36%. Consider increasing payments on high-interest debt or reducing discretionary spending.';
    } else {
      category = 'critical';
      recommendation =
        'Your debt-to-income ratio is very high, which can make it difficult to qualify for new credit and signals financial strain. Consider speaking with a financial coach about a debt payoff strategy.';
    }

    return {
      monthlyIncome: Number(monthlyIncome.toFixed(2)),
      monthlyDebtPayments: Number(monthlyDebtPayments.toFixed(2)),
      dtiRatio: Number(dtiRatio.toFixed(2)),
      category,
      recommendation,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async refreshGoalCompletion(goal: Goal): Promise<Goal> {
    const wasCompleted = goal.completed;
    const shouldComplete = Number(goal.currentAmount) >= Number(goal.targetAmount);

    if (shouldComplete !== wasCompleted) {
      goal.completed = shouldComplete;
      return this.goalsRepository.save(goal);
    }

    return goal;
  }
}
