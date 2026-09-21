import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentPlansService } from './payment-plans.service';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { UpdatePaymentPlanDto } from './dto/update-payment-plan.dto';
import { FilterPaymentPlanDto } from './dto/filter-payment-plan.dto';
import { FilterPaymentPlanPaymentDto } from './dto/filter-payment-plan-payment.dto';
import { FailPaymentDto } from './dto/fail-payment.dto';

@Controller('payment-plans')
@UseGuards(JwtAuthGuard)
export class PaymentPlansController {
  constructor(private readonly paymentPlansService: PaymentPlansService) {}

  @Post()
  create(@Body() dto: CreatePaymentPlanDto) {
    return this.paymentPlansService.createPlan(dto.collectionAccountId, dto);
  }

  @Get()
  findAll(@Query() filter: FilterPaymentPlanDto) {
    return this.paymentPlansService.getPlans(filter);
  }

  @Get('upcoming/:days')
  getUpcomingPayments(@Param('days') days: string) {
    return this.paymentPlansService.getUpcomingPayments(parseInt(days, 10) || 7);
  }

  @Get('overdue')
  getOverduePayments() {
    return this.paymentPlansService.getOverduePayments();
  }

  @Get('stats/:collectionAccountId')
  getStats(@Param('collectionAccountId') collectionAccountId: string) {
    return this.paymentPlansService.getPlanStats(collectionAccountId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentPlansService.getPlan(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentPlanDto) {
    return this.paymentPlansService.updatePlan(id, dto);
  }

  @Get(':id/payments')
  getPayments(@Param('id') id: string, @Query() filter: FilterPaymentPlanPaymentDto) {
    return this.paymentPlansService.getPlanPayments(id, filter);
  }

  @Post(':id/payments/:paymentId/process')
  processPayment(@Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.paymentPlansService.processPayment(id, paymentId);
  }

  @Post(':id/payments/:paymentId/fail')
  failPayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: FailPaymentDto,
  ) {
    return this.paymentPlansService.failPayment(id, paymentId, dto.reason);
  }
}
