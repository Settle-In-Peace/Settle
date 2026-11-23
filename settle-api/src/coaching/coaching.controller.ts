import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CoachingService } from './coaching.service';
import { CoachingEntitlementGuard } from './coaching-entitlement.guard';
import { CreateBudgetDto } from './dtos/create-budget.dto';
import { UpdateBudgetDto } from './dtos/update-budget.dto';
import { CreateGoalDto } from './dtos/create-goal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('coaching')
@UseGuards(JwtAuthGuard)
export class CoachingController {
  constructor(private coachingService: CoachingService) {}

  // --- Budgets (subscription-gated) ---

  @Post('budgets')
  @UseGuards(CoachingEntitlementGuard)
  async createBudget(@Request() req, @Body() dto: CreateBudgetDto) {
    return this.coachingService.createBudget(req.user.sub, dto);
  }

  @Get('budgets')
  @UseGuards(CoachingEntitlementGuard)
  async getBudgets(@Request() req) {
    return this.coachingService.getBudgets(req.user.sub);
  }

  @Put('budgets/:id')
  @UseGuards(CoachingEntitlementGuard)
  async updateBudget(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.coachingService.updateBudget(req.user.sub, id, dto);
  }

  @Delete('budgets/:id')
  @UseGuards(CoachingEntitlementGuard)
  async deleteBudget(@Request() req, @Param('id') id: string) {
    await this.coachingService.deleteBudget(req.user.sub, id);
    return { success: true };
  }

  // --- Goals (subscription-gated) ---

  @Post('goals')
  @UseGuards(CoachingEntitlementGuard)
  async createGoal(@Request() req, @Body() dto: CreateGoalDto) {
    return this.coachingService.createGoal(req.user.sub, dto);
  }

  @Get('goals')
  @UseGuards(CoachingEntitlementGuard)
  async getGoals(@Request() req) {
    return this.coachingService.getGoals(req.user.sub);
  }

  @Put('goals/:id/progress')
  @UseGuards(CoachingEntitlementGuard)
  async updateGoalProgress(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { currentAmount: number },
  ) {
    return this.coachingService.updateGoalProgress(
      req.user.sub,
      id,
      body.currentAmount,
    );
  }

  @Delete('goals/:id')
  @UseGuards(CoachingEntitlementGuard)
  async deleteGoal(@Request() req, @Param('id') id: string) {
    await this.coachingService.deleteGoal(req.user.sub, id);
    return { success: true };
  }

  // --- Subscription status (reachable for all signed-in users so ---
  // --- the paywall can render; returns only the caller's own sub  ---
  // --- state — never gated)                                      ---

  @Get('subscription')
  async getSubscription(@Request() req) {
    return this.coachingService.getSubscriptionStatus(req.user.sub);
  }

  // --- Dashboard (reachable for all signed-in users; payload is ---
  // --- entitlement-masked inside the service)                    ---

  @Get('dashboard')
  async getDashboard(@Request() req) {
    return this.coachingService.getDashboard(req.user.sub);
  }

  // --- Calculators (subscription-gated) ---

  @Post('calculators/debt-payoff')
  @UseGuards(CoachingEntitlementGuard)
  async calculateDebtPayoff(
    @Request() req,
    @Body()
    body: {
      totalDebt: number;
      monthlyPayment: number;
      interestRate: number;
    },
  ) {
    return this.coachingService.calculateDebtPayoff(
      req.user.sub,
      body.totalDebt,
      body.monthlyPayment,
      body.interestRate,
    );
  }

  @Post('calculators/dti')
  @UseGuards(CoachingEntitlementGuard)
  async calculateDebtToIncome(
    @Request() req,
    @Body() body: { monthlyIncome: number; monthlyDebtPayments: number },
  ) {
    return this.coachingService.calculateDebtToIncome(
      body.monthlyIncome,
      body.monthlyDebtPayments,
    );
  }
}
