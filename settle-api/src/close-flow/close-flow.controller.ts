import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { Inject } from '@nestjs/common';
import { CloseFlowService } from './close-flow.service';
import { CLOSE_FLOW_SITE, type CloseFlowSiteConfig, type CloseLeadInput } from './close-flow.types';

/**
 * Close-flow surface. Intake + pipeline are x-internal-key gated (same
 * pattern as notifications.controller.ts); the Stripe webhook verifies the
 * signature instead. Sites that already have a Stripe webhook endpoint can
 * just call fulfillSession() from that fan-out and skip registering this URL.
 */
@Controller('close-flow')
export class CloseFlowController {
  constructor(
    private readonly closeFlow: CloseFlowService,
    @Inject(CLOSE_FLOW_SITE) private readonly site: CloseFlowSiteConfig,
  ) {}

  private assertInternalKey(internalKey?: string) {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected || internalKey !== expected) {
      throw new UnauthorizedException('Valid x-internal-key header required');
    }
  }

  /** Generic intake — sites without a native lead table POST here; sites
   *  with one call closeFlow.intake() in-process after persisting. */
  @Post('intake')
  @HttpCode(201)
  async intake(@Body() body: CloseLeadInput, @Headers('x-internal-key') key?: string) {
    this.assertInternalKey(key);
    if (!body?.email && !body?.phone) {
      throw new BadRequestException('email or phone is required');
    }
    return this.closeFlow.intake(body, this.site);
  }

  /** Funnel counts for the CRM board: {total, byStatus:{active,paid,...}} */
  @Get('pipeline')
  async pipeline(@Query('site') site: string | undefined, @Headers('x-internal-key') key?: string) {
    this.assertInternalKey(key);
    return this.closeFlow.pipeline(site);
  }

  /** Force-run one sweep pass (ops/debug). */
  @Post('sweep')
  @HttpCode(202)
  async sweep(@Headers('x-internal-key') key?: string) {
    this.assertInternalKey(key);
    void this.closeFlow.sweep();
    return { accepted: true };
  }

  /** Dedicated Stripe endpoint (optional). Verifies signature, then hands
   *  checkout.session.completed to the shared fulfiller. Register with
   *  STRIPE_CLOSE_WEBHOOK_SECRET; falls back to the site's main secret. */
  @Post('stripe-webhook')
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!signature || !req.rawBody) throw new BadRequestException('Missing signature/raw body');
    const secret =
      process.env.STRIPE_CLOSE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    const stripe = new Stripe(apiKey);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, secret);
    } catch (e: any) {
      throw new BadRequestException(`Webhook signature failed: ${e?.message || e}`);
    }
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await this.closeFlow.fulfillSession(event.data.object as Stripe.Checkout.Session);
    }
    return { received: true };
  }
}
