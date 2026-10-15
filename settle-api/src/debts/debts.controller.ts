import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DebtsService } from './debts.service';
import { CreateDebtDto } from './dtos/create-debt.dto';
import { UpdateDebtDto } from './dtos/update-debt.dto';

@Controller('debts')
@UseGuards(JwtAuthGuard)
export class DebtsController {
  constructor(private debtsService: DebtsService) {}

  @Post()
  async createDebt(@Request() req, @Body() createDebtDto: CreateDebtDto) {
    const { dueDate, ...rest } = createDebtDto;
    return this.debtsService.createDebt(req.user.sub, {
      ...rest,
      ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
    });
  }

  @Get()
  async getUserDebts(@Request() req) {
    return this.debtsService.getUserDebts(req.user.sub);
  }

  @Get('summary')
  async getDebtSummary(@Request() req) {
    return this.debtsService.getDebtSummary(req.user.sub);
  }

  /**
   * Client-facing payoff progress — debts rollup + program enrollment
   * (if the caller is enrolled) + per-account paydown + next milestone.
   */
  @Get('progress')
  async getProgress(@Request() req) {
    return this.debtsService.getProgress(req.user.sub);
  }

  @Get(':id')
  async getDebtById(@Param('id') id: string, @Request() req) {
    return this.debtsService.getDebtById(id, req.user.sub);
  }

  @Put(':id')
  async updateDebt(@Param('id') id: string, @Request() req, @Body() updateDebtDto: UpdateDebtDto) {
    const { dueDate, ...rest } = updateDebtDto;
    return this.debtsService.updateDebt(id, req.user.sub, {
      ...rest,
      ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
    });
  }

  @Delete(':id')
  async deleteDebt(@Param('id') id: string, @Request() req) {
    return this.debtsService.deleteDebt(id, req.user.sub);
  }
}