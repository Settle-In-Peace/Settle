import {
  Controller,
  Get,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import { PaymentPortalService } from './payment-portal.service';
import { CreatePortalPaymentPlanDto } from './dto/create-portal-payment-plan.dto';
import { MakeOneTimePaymentDto } from './dto/make-one-time-payment.dto';
import { CompletePortalPaymentDto } from './dto/complete-portal-payment.dto';

@Controller('portal/pay')
export class PaymentPortalController {
  constructor(private readonly paymentPortalService: PaymentPortalService) {}

  @Get(':token')
  async getAccountByToken(@Param('token') token: string) {
    const account = await this.paymentPortalService.getAccountByToken(token);
    return this.paymentPortalService.getAccountSummary(account.id);
  }

  @Get(':token/options')
  async getPaymentOptions(@Param('token') token: string) {
    const account = await this.paymentPortalService.getAccountByToken(token);
    return this.paymentPortalService.getPaymentOptions(account.id);
  }

  @Post(':token/plan')
  async createPaymentPlan(
    @Param('token') token: string,
    @Body() dto: CreatePortalPaymentPlanDto,
  ) {
    const account = await this.paymentPortalService.getAccountByToken(token);
    return this.paymentPortalService.createPaymentPlan(account.id, dto);
  }

  @Post(':token/payment')
  async makeOneTimePayment(
    @Param('token') token: string,
    @Body() dto: MakeOneTimePaymentDto,
  ) {
    const account = await this.paymentPortalService.getAccountByToken(token);
    return this.paymentPortalService.makeOneTimePayment(account.id, dto);
  }

  /**
   * Credit a PaymentIntent after client-side 3DS confirmation. Idempotent —
   * safe for the client to call on every requires_action completion.
   */
  @Post(':token/payment/complete')
  async completeOneTimePayment(
    @Param('token') token: string,
    @Body() dto: CompletePortalPaymentDto,
  ) {
    const account = await this.paymentPortalService.getAccountByToken(token);
    return this.paymentPortalService.completeOneTimePayment(account.id, dto);
  }

  @Get(':token/history')
  async getPaymentHistory(@Param('token') token: string) {
    const account = await this.paymentPortalService.getAccountByToken(token);
    return this.paymentPortalService.getPaymentHistory(account.id);
  }
}
