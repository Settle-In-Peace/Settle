import { Controller, Post, Body, Req, Headers, UseGuards, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StripeService, CREDIT_PACKAGES } from './stripe.service';
import { SiCreditsService } from '../si-credits/si-credits.service';

@Controller('stripe')
export class StripeController {
  constructor(
    private stripeService: StripeService,
    private siCredits: SiCreditsService,
  ) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(@Req() req: Request & { user: any }, @Body() body: { credits: number }) {
    const providerId = req.user.sub;
    const pkg = CREDIT_PACKAGES.find((p) => p.credits === body.credits);

    if (!pkg) {
      throw new BadRequestException(
        `Invalid credit package. Available packages: ${CREDIT_PACKAGES.map((p) => p.credits).join(', ')}`,
      );
    }

    const session = await this.stripeService.createCheckoutSession(providerId, pkg.credits, pkg.amount);
    return { url: session.url, sessionId: session.id };
  }

  @Post('coaching/checkout')
  @UseGuards(JwtAuthGuard)
  async createCoachingCheckout(@Req() req: Request & { user: any }, @Body('returnUrl') returnUrl: string) {
    if (!returnUrl) {
      throw new BadRequestException('returnUrl is required');
    }
    const session = await this.stripeService.createCoachingCheckoutSession(req.user, returnUrl);
    return { url: session.url, sessionId: session.id };
  }

  @Post('lead-checkout')
  @UseGuards(JwtAuthGuard)
  async createLeadCheckout(
    @Req() req: Request & { user: any },
    @Body('leadId') leadId: string,
  ) {
    if (!leadId) {
      throw new BadRequestException('leadId is required');
    }
    const session = await this.stripeService.createLeadCheckoutSession(leadId, req.user.sub);
    return { url: session.url, sessionId: session.id };
  }

  @Post('provider-subscription')
  @UseGuards(JwtAuthGuard)
  async createProviderSubscription(
    @Req() req: Request & { user: any },
    @Body('tierId') tierId: string,
  ) {
    if (!tierId) {
      throw new BadRequestException('tierId is required');
    }
    const session = await this.stripeService.createProviderSubscriptionSession(req.user.sub, tierId);
    return { url: session.url, sessionId: session.id };
  }

  /**
   * SI credit pack checkout — one-time Stripe payment; the webhook
   * (`si_credit_pack`) grants the credits at the shared gateway.
   * Body: { packId: 'starter' | 'growth' | 'pro' } (env-overridable catalog).
   */
  @Post('si-credits-checkout')
  @UseGuards(JwtAuthGuard)
  async createSiCreditsCheckout(
    @Req() req: Request & { user: any },
    @Body('packId') packId: string,
  ) {
    if (!packId || !this.siCredits.getPack(packId)) {
      throw new BadRequestException(
        `Invalid SI credit pack. Available packs: ${this.siCredits.getPacks().map((p) => p.id).join(', ')}`,
      );
    }
    const session = await this.stripeService.createSiCreditsCheckoutSession(
      req.user.sub,
      packId,
    );
    return { url: session.url, sessionId: session.id };
  }

  @Post('directory-checkout')
  @UseGuards(JwtAuthGuard)
  async createDirectoryCheckout(
    @Req() req: Request & { user: any },
    @Body('tierId') tierId: string,
  ) {
    if (!tierId) {
      throw new BadRequestException('tierId is required');
    }
    const session = await this.stripeService.createDirectoryCheckoutSession(req.user.sub, tierId);
    return { url: session.url, sessionId: session.id };
  }

  @Post('billing-portal')
  @UseGuards(JwtAuthGuard)
  async createBillingPortal(@Req() req: Request & { user: any }) {
    let session: Stripe.BillingPortal.Session;
    if (req.user.role === 'provider') {
      session = await this.stripeService.createProviderBillingPortalSession(req.user.sub);
    } else {
      session = await this.stripeService.createCoachingBillingPortalSession(req.user.sub);
    }
    return { url: session.url };
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const rawBody = req.rawBody as Buffer;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available for signature verification');
    }

    const event = this.stripeService.verifyWebhookSignature(rawBody, signature);
    await this.stripeService.handleWebhookEvent(event);
    return { received: true };
  }
}
