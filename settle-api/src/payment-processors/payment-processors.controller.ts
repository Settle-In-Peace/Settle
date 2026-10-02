import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesGuard } from '../auth/guards/sales.guard';
import { PaymentProcessorsService } from './payment-processors.service';
import {
  ProcessorNotConfiguredError,
  WebhookVerificationError,
} from './payment-processor.interface';
import { ChargePaymentDto } from './dto/charge-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

/**
 * High-risk payment processor routes (NMI first, AuthNet + Stripe fallback).
 *
 * PCI: /charge accepts a processor token or vault id ONLY — see
 * assertNoSensitiveCardData(). Raw PAN/CVV payloads are rejected.
 *
 * Webhook route is unauthenticated by design (processors can't hold JWTs);
 * authenticity comes from the provider signature/shared-secret check, which
 * fails closed when no secret is configured.
 */
@Controller('payment-processors')
export class PaymentProcessorsController {
  constructor(private readonly service: PaymentProcessorsService) {}

  /** Per-processor config status + hosted-fields descriptors (public keys only). */
  @Get('status')
  @UseGuards(JwtAuthGuard, SalesGuard)
  getStatus() {
    return this.service.getStatus();
  }

  /** Charge a processor token / vault id. Declines return 200 with status='declined'. */
  @Post('charge')
  @UseGuards(JwtAuthGuard, SalesGuard)
  async charge(@Body() dto: ChargePaymentDto, @Req() req: AuthenticatedRequest) {
    try {
      return await this.service.charge(dto, req.user.sub);
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard, SalesGuard)
  async refund(@Body() dto: RefundPaymentDto, @Req() req: AuthenticatedRequest) {
    try {
      return await this.service.refund(dto, req.user.sub);
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  @Post('void')
  @UseGuards(JwtAuthGuard, SalesGuard)
  async void(@Body() dto: VoidPaymentDto, @Req() req: AuthenticatedRequest) {
    try {
      return await this.service.void(dto, req.user.sub);
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  /** Payment history for a collection account. */
  @Get('accounts/:accountId/payments')
  @UseGuards(JwtAuthGuard, SalesGuard)
  getAccountPayments(@Param('accountId') accountId: string) {
    return this.service.getPaymentsForAccount(accountId);
  }

  /** Payment history for a debt. */
  @Get('debts/:debtId/payments')
  @UseGuards(JwtAuthGuard, SalesGuard)
  getDebtPayments(@Param('debtId') debtId: string) {
    return this.service.getPaymentsForDebt(debtId);
  }

  /**
   * Processor webhook ingest (public — signature-verified).
   * Requires the raw body; main.ts must list /payment-processors/webhooks
   * in isRawBodyWebhookRoute (see module README).
   */
  @Post('webhooks/:processor')
  async webhook(
    @Param('processor') processor: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: any,
    @Headers('webhook-signature') nmiSignature?: string,
    @Headers('x-anet-signature') anetSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    const rawBody =
      req.rawBody ??
      (typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? req.body
        : body != null
          ? JSON.stringify(body)
          : '');
    if (!rawBody || (Buffer.isBuffer(rawBody) && !rawBody.length)) {
      throw new BadRequestException('Webhook body is required');
    }
    const signature = nmiSignature ?? anetSignature ?? stripeSignature;
    try {
      const event = await this.service.handleWebhook(
        processor,
        rawBody,
        signature,
      );
      return { received: true, eventType: event.eventType, status: event.status };
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  private toHttp(err: unknown): Error {
    if (err instanceof ProcessorNotConfiguredError) {
      return new ServiceUnavailableException(err.message);
    }
    if (err instanceof WebhookVerificationError) {
      return new UnauthorizedException(err.message);
    }
    if (
      err instanceof BadRequestException ||
      err instanceof NotFoundException ||
      err instanceof ServiceUnavailableException ||
      err instanceof UnauthorizedException
    ) {
      return err as Error;
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
