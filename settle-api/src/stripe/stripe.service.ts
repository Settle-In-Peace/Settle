import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { ProvidersService } from '../providers/providers.service';
import { Provider } from '../entities/provider.entity';
import { Lead } from '../entities/lead.entity';
import { User } from '../entities/user.entity';
import { CoachingSubscription } from '../entities/coaching-subscription.entity';
import { EmailService } from '../email/email.service';

export interface CreditPackage {
  credits: number;
  amount: number; // in dollars
  label: string;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { credits: 500, amount: 50, label: 'Starter' },
  { credits: 1000, amount: 90, label: 'Professional' },
  { credits: 2500, amount: 200, label: 'Business' },
  { credits: 5000, amount: 350, label: 'Enterprise' },
];

export interface ProviderSubscriptionTier {
  id: string; // starter, growth, scale
  label: string;
  priceMonthly: number; // in dollars
  seats: number;
  priceEnvVar: string; // env var holding the Stripe price ID
}

export const PROVIDER_SUBSCRIPTION_TIERS: ProviderSubscriptionTier[] = [
  { id: 'starter', label: 'Starter', priceMonthly: 500, seats: 5, priceEnvVar: 'STRIPE_PRICE_PROVIDER_STARTER' },
  { id: 'growth', label: 'Growth', priceMonthly: 1000, seats: 15, priceEnvVar: 'STRIPE_PRICE_PROVIDER_GROWTH' },
  { id: 'scale', label: 'Scale', priceMonthly: 2500, seats: 50, priceEnvVar: 'STRIPE_PRICE_PROVIDER_SCALE' },
];

export const COACHING_SUBSCRIPTION_PRICE_MONTHLY = 49;
const COACHING_PRICE_ENV_VAR = 'STRIPE_COACHING_PRICE_ID';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private providersService: ProvidersService,
    private emailService: EmailService,
    @InjectRepository(Lead)
    private leadsRepository: Repository<Lead>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    @InjectRepository(CoachingSubscription)
    private coachingSubscriptionsRepository: Repository<CoachingSubscription>,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.error('STRIPE_SECRET_KEY is not set — Stripe calls will fail until it is configured in environment variables.');
    }
    this.stripe = new Stripe(secretKey || 'sk_test_placeholder', {
      apiVersion: '2026-06-24.dahlia',
    });
  }

  // ---------------------------------------------------------------------------
  // Customer management
  // ---------------------------------------------------------------------------

  async createCustomer(email: string): Promise<string> {
    const customer = await this.stripe.customers.create({ email });
    return customer.id;
  }

  private async ensureProviderCustomer(provider: Provider): Promise<string> {
    if (provider.stripeCustomerId) return provider.stripeCustomerId;
    const customerId = await this.createCustomer(provider.email);
    await this.providersService.updateProvider(provider.id, { stripeCustomerId: customerId });
    return customerId;
  }

  private async ensureUserCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customerId = await this.createCustomer(user.email);
    await this.usersRepository.update(user.id, { stripeCustomerId: customerId });
    return customerId;
  }

  // ---------------------------------------------------------------------------
  // Pay-per-lead credit packages (existing, kept for backward compatibility)
  // ---------------------------------------------------------------------------

  async createCheckoutSession(
    providerId: string,
    credits: number,
    amount: number,
  ): Promise<Stripe.Checkout.Session> {
    const provider = await this.providersService.getProviderById(providerId);
    const customerId = await this.ensureProviderCustomer(provider as Provider);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3025';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} Lead Credits`,
              description: `Purchase of ${credits} lead credits for the Settle marketplace.`,
            },
            unit_amount: amount * 100, // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        providerId,
        type: 'credit_package',
        credits: credits.toString(),
        amount: amount.toString(),
      },
      success_url: `${frontendUrl}/portal/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/portal/billing/cancel`,
    });

    return session;
  }

  // ---------------------------------------------------------------------------
  // Pay-per-lead purchasing — buy an individual lead via Stripe Checkout
  // ---------------------------------------------------------------------------

  async createLeadCheckoutSession(leadId: string, providerId: string): Promise<Stripe.Checkout.Session> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status !== 'available') throw new BadRequestException('Lead is no longer available');

    const provider = await this.providersService.getProviderById(providerId);
    const customerId = await this.ensureProviderCustomer(provider as Provider);

    // Compute the sale price (in dollars) using the same tiering as LeadsService
    const price = this.calculateLeadPrice(lead);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3025';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Lead: ${lead.firstName} ${lead.lastName.charAt(0)}. — ${lead.state}`,
              description: `Exclusive lead purchase. Total debt: $${Number(lead.totalDebt).toLocaleString()}.`,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'lead_purchase',
        leadId,
        providerId,
        salePrice: price.toString(),
      },
      success_url: `${frontendUrl}/portal/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/portal/billing/cancel`,
    });

    return session;
  }

  // ---------------------------------------------------------------------------
  // Provider subscription billing — monthly marketplace seat plans
  // ---------------------------------------------------------------------------

  async createProviderSubscriptionSession(
    providerId: string,
    tierId: string,
  ): Promise<Stripe.Checkout.Session> {
    const tier = PROVIDER_SUBSCRIPTION_TIERS.find((t) => t.id === tierId);
    if (!tier) {
      throw new BadRequestException(
        `Invalid subscription tier. Available: ${PROVIDER_SUBSCRIPTION_TIERS.map((t) => t.id).join(', ')}`,
      );
    }

    const priceId = this.configService.get<string>(tier.priceEnvVar);
    if (!priceId) {
      throw new BadRequestException(
        `Stripe price ID not configured for tier "${tier.id}" (env var ${tier.priceEnvVar}).`,
      );
    }

    const provider = await this.providersService.getProviderById(providerId);
    const customerId = await this.ensureProviderCustomer(provider as Provider);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3025';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        type: 'provider_subscription',
        providerId,
        tier: tier.id,
        seats: tier.seats.toString(),
      },
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          type: 'provider_subscription',
          providerId,
          tier: tier.id,
          seats: tier.seats.toString(),
        },
      },
      success_url: `${frontendUrl}/portal/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/portal/billing/cancel`,
    });

    return session;
  }

  // ---------------------------------------------------------------------------
  // Coaching subscription — $49/month consumer coaching
  // ---------------------------------------------------------------------------

  async createCoachingCheckoutSession(user: User, returnUrl: string): Promise<Stripe.Checkout.Session> {
    const priceId = this.configService.get<string>(COACHING_PRICE_ENV_VAR);
    if (!priceId) {
      throw new BadRequestException(
        `Stripe price ID not configured for coaching subscription (env var ${COACHING_PRICE_ENV_VAR}).`,
      );
    }

    const userId = user.id;
    if (!userId) throw new BadRequestException('Authenticated user ID is required');

    // Attach a real Stripe customer (persisted on the user row) instead of
    // customer_email — otherwise the billing-portal session can never find a
    // customer and subscribers could not manage/cancel their subscription.
    const dbUser =
      (await this.usersRepository.findOne({ where: { id: userId } })) ?? user;
    const customerId = await this.ensureUserCustomer(dbUser);

    return this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnUrl}/portal/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}/portal/billing/cancel`,
      metadata: {
        userId,
        type: 'coaching_subscription',
      },
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          userId,
          type: 'coaching_subscription',
        },
      },
    });
  }

  // Kept for callers that use the original server-derived return URL flow.
  async createCoachingSubscriptionSession(userId: string): Promise<Stripe.Checkout.Session> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3025';
    return this.createCoachingCheckoutSession(user, frontendUrl);
  }

  // ---------------------------------------------------------------------------
  // Billing portal — let customers manage their subscription
  // ---------------------------------------------------------------------------

  async createProviderBillingPortalSession(providerId: string): Promise<Stripe.BillingPortal.Session> {
    const provider = await this.providersService.getProviderById(providerId);
    const customerId = provider.stripeCustomerId;
    if (!customerId) {
      throw new BadRequestException('No billing account found. Please start a subscription first.');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3025';

    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontendUrl}/portal/billing`,
    });
  }

  async createCoachingBillingPortalSession(userId: string): Promise<Stripe.BillingPortal.Session> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      // Subscribers who checked out via the old customer_email path never got
      // a stored customer id — recover it from Stripe by email so they can
      // still reach the billing portal to cancel/manage.
      const found = await this.stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data[0]?.id;
      if (customerId) {
        await this.usersRepository.update(user.id, { stripeCustomerId: customerId });
      }
    }
    if (!customerId) {
      throw new BadRequestException('No billing account found. Please start a subscription first.');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3025';

    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontendUrl}/coaching`,
    });
  }

  // ---------------------------------------------------------------------------
  // Webhook handling
  // ---------------------------------------------------------------------------

  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
      }
      this.logger.error('STRIPE_WEBHOOK_SECRET is not set — webhook signature verification cannot succeed.');
      throw new BadRequestException('Webhook secret is not configured');
    }

    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
    });

    try {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook signature verification failed: ${message}`);
      throw new BadRequestException('Webhook signature verification failed');
    }
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionDeleted(subscription);
        break;
      }

      case 'checkout.session.async_payment_failed':
      case 'payment_intent.payment_failed': {
        this.logger.warn(`Payment failed for event ${event.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.handleInvoicePaymentFailed(invoice);
        break;
      }

      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const type = session.metadata?.type;

    switch (type) {
      case 'credit_package': {
        const providerId = session.metadata?.providerId;
        const credits = parseInt(session.metadata?.credits || '0', 10);
        if (providerId && credits > 0) {
          await this.providersService.addCredit(providerId, credits);
          this.logger.log(`Added ${credits} credits to provider ${providerId}`);
        } else {
          this.logger.warn(`credit_package checkout missing metadata: ${JSON.stringify(session.metadata)}`);
        }
        break;
      }

      case 'lead_purchase': {
        const leadId = session.metadata?.leadId;
        const providerId = session.metadata?.providerId;
        const salePrice = parseFloat(session.metadata?.salePrice || '0');
        if (leadId && providerId && salePrice > 0) {
          await this.fulfillLeadPurchase(leadId, providerId, salePrice);
        } else {
          this.logger.warn(`lead_purchase checkout missing metadata: ${JSON.stringify(session.metadata)}`);
        }
        break;
      }

      case 'provider_subscription': {
        // The subscription record is created by Stripe; the subscription.updated
        // event carries the authoritative status. Record the subscription id now.
        const providerId = session.metadata?.providerId;
        const tier = session.metadata?.tier;
        const seats = parseInt(session.metadata?.seats || '0', 10);
        if (providerId) {
          await this.providersService.updateProvider(providerId, {
            stripeSubscriptionId: session.subscription as string,
            subscriptionTier: tier,
            subscriptionSeats: seats || undefined,
            subscriptionType: 'marketplace_seat',
          });
          this.logger.log(`Provider ${providerId} subscribed to ${tier} tier`);
        }
        break;
      }

      case 'coaching_subscription': {
        const userId = session.metadata?.userId;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : undefined;
        if (!userId || !subscriptionId) {
          this.logger.warn(`coaching_subscription checkout missing metadata: ${JSON.stringify(session.metadata)}`);
          break;
        }

        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
        const status = subscription.status;
        const currentPeriodEnd = (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000)
          : undefined;
        await this.usersRepository.update(userId, {
          stripeSubscriptionId: subscriptionId,
          coachingSubscriptionStatus: status,
          coachingCurrentPeriodEnd: currentPeriodEnd,
          coachingCancelAtPeriodEnd: (subscription as any).cancel_at_period_end ?? false,
          // Persist the Stripe customer id so the billing portal works even
          // for sessions created before customer attachment was added.
          ...(typeof session.customer === 'string' ? { stripeCustomerId: session.customer } : {}),
        });
        await this.upsertCoachingSubscription(userId, subscriptionId, status, new Date());
        this.logger.log(`User ${userId} subscribed to coaching`);

        // Send coaching welcome email (respect notification preferences)
        try {
          const user = await this.usersRepository.findOne({ where: { id: userId } });
          if (user && user.emailNotifications !== false) {
            await this.emailService.sendCoachingWelcome(user);
          }
        } catch (err) {
          this.logger.error(`Failed to send coaching welcome email: ${err instanceof Error ? err.message : String(err)}`);
        }
        break;
      }

      default:
        this.logger.warn(`checkout.session.completed with unknown/missing type: ${JSON.stringify(session.metadata)}`);
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const type = subscription.metadata?.type;

    if (type === 'provider_subscription') {
      const providerId = subscription.metadata?.providerId;
      if (!providerId) return;
      const tier = subscription.metadata?.tier;
      const seats = parseInt(subscription.metadata?.seats || '0', 10);
      await this.providersService.updateProvider(providerId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionTier: tier,
        subscriptionSeats: seats || undefined,
        currentPeriodEnd: (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000)
          : undefined,
        cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
      });
      this.logger.log(`Provider ${providerId} subscription updated: ${subscription.status}`);
      return;
    }

    if (type === 'coaching_subscription') {
      const userId = subscription.metadata?.userId;
      if (!userId) return;
      await this.usersRepository.update(userId, {
        stripeSubscriptionId: subscription.id,
        coachingSubscriptionStatus: subscription.status,
        coachingCurrentPeriodEnd: (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000)
          : undefined,
        coachingCancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
      });
      await this.upsertCoachingSubscription(userId, subscription.id, subscription.status);
      this.logger.log(`User ${userId} coaching subscription updated: ${subscription.status}`);
      return;
    }

    this.logger.log(`subscription.updated with no recognized type metadata: ${subscription.id}`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const type = subscription.metadata?.type;

    if (type === 'provider_subscription') {
      const providerId = subscription.metadata?.providerId;
      if (!providerId) return;
      await this.providersService.updateProvider(providerId, {
        subscriptionStatus: 'canceled',
        subscriptionTier: undefined,
        subscriptionSeats: undefined,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: false,
        subscriptionType: 'pay_per_lead',
        isAcceptingLeads: false,
      });
      this.logger.log(`Provider ${providerId} subscription canceled`);

      // Send cancellation email
      try {
        const provider = await this.providersRepository.findOne({ where: { id: providerId } });
        if (provider) {
          await this.emailService.sendSubscriptionCancelled(provider, 'provider_subscription');
        }
      } catch (err) {
        this.logger.error(`Failed to send subscription cancelled email: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (type === 'coaching_subscription') {
      const userId = subscription.metadata?.userId;
      if (!userId) return;
      await this.usersRepository.update(userId, {
        coachingSubscriptionStatus: 'canceled',
        coachingCurrentPeriodEnd: undefined,
        coachingCancelAtPeriodEnd: false,
      });
      await this.upsertCoachingSubscription(userId, subscription.id, 'canceled', undefined, new Date());
      this.logger.log(`User ${userId} coaching subscription canceled`);

      // Send cancellation email (respect notification preferences)
      try {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (user && user.emailNotifications !== false) {
          await this.emailService.sendSubscriptionCancelled(user, 'coaching');
        }
      } catch (err) {
        this.logger.error(`Failed to send subscription cancelled email: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    this.logger.log(`subscription.deleted with no recognized type metadata: ${subscription.id}`);
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : undefined;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : undefined;
    if (!subscriptionId) {
      this.logger.warn(`invoice.payment_failed with no subscription id: ${invoice.id}`);
      return;
    }

    let type: string | undefined;
    let userId: string | undefined;
    let providerId: string | undefined;

    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
      type = subscription.metadata?.type;
      userId = subscription.metadata?.userId;
      providerId = subscription.metadata?.providerId;
    } catch (err) {
      this.logger.error(`Failed to retrieve subscription ${subscriptionId} for payment failure: ${err instanceof Error ? err.message : String(err)}`);
    }

    const amount = (invoice as any).amount_due ? (invoice as any).amount_due / 100 : undefined;

    if (type === 'coaching_subscription' && userId) {
      try {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (user && user.emailNotifications !== false) {
          await this.emailService.sendPaymentFailed(user, 'coaching', amount);
        }
      } catch (err) {
        this.logger.error(`Failed to send payment failed email: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    if (type === 'provider_subscription' && providerId) {
      try {
        const provider = await this.providersRepository.findOne({ where: { id: providerId } });
        if (provider) {
          await this.emailService.sendPaymentFailed(provider, 'provider_subscription', amount);
        }
      } catch (err) {
        this.logger.error(`Failed to send payment failed email: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    // Fallback: try to resolve by Stripe customer id when metadata is missing
    if (customerId && !userId && !providerId) {
      try {
        const user = await this.usersRepository.findOne({ where: { stripeCustomerId: customerId } });
        if (user && user.emailNotifications !== false) {
          await this.emailService.sendPaymentFailed(user, 'coaching', amount);
          return;
        }
        const provider = await this.providersRepository.findOne({ where: { stripeCustomerId: customerId } });
        if (provider) {
          await this.emailService.sendPaymentFailed(provider, 'provider_subscription', amount);
        }
      } catch (err) {
        this.logger.error(`Failed to send payment failed email (fallback): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.logger.warn(`invoice.payment_failed with no recognized type metadata: ${invoice.id}`);
  }

  private async upsertCoachingSubscription(
    userId: string,
    stripeSubscriptionId: string,
    status: string,
    startedAt?: Date,
    canceledAt?: Date,
  ): Promise<void> {
    const existing = await this.coachingSubscriptionsRepository.findOne({
      where: { stripeSubscriptionId },
    });
    const subscription = existing || this.coachingSubscriptionsRepository.create({ userId, stripeSubscriptionId });
    subscription.userId = userId;
    subscription.stripeSubscriptionId = stripeSubscriptionId;
    subscription.status = status;
    if (startedAt && !subscription.startedAt) subscription.startedAt = startedAt;
    if (canceledAt) subscription.canceledAt = canceledAt;
    await this.coachingSubscriptionsRepository.save(subscription);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Marks a lead as sold to the provider after a successful pay-per-lead
   * checkout. Mirrors the pricing logic in LeadsService so the recorded
   * salePrice matches what was charged.
   */
  private async fulfillLeadPurchase(leadId: string, providerId: string, salePrice: number): Promise<void> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) {
      this.logger.warn(`fulfillLeadPurchase: lead ${leadId} not found`);
      return;
    }
    if (lead.status === 'sold' && lead.purchasedBy === providerId) {
      this.logger.log(`Lead ${leadId} already purchased by provider ${providerId}, skipping`);
      return;
    }
    if (lead.status !== 'available') {
      this.logger.warn(`fulfillLeadPurchase: lead ${leadId} no longer available (status=${lead.status})`);
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day exclusive access window

    await this.leadsRepository.update(leadId, {
      status: 'sold',
      purchasedBy: providerId,
      salePrice,
      purchasedAt: new Date(),
      expiresAt,
    });
    this.logger.log(`Lead ${leadId} sold to provider ${providerId} for $${salePrice}`);

    // Send lead purchase confirmation email to the provider
    try {
      const provider = await this.providersRepository.findOne({ where: { id: providerId } });
      if (provider) {
        await this.emailService.sendLeadPurchaseConfirmation(provider, lead, salePrice);
      }
    } catch (err) {
      this.logger.error(`Failed to send lead purchase confirmation: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private calculateLeadPrice(lead: Lead): number {
    const debt = Number(lead.totalDebt) || 0;
    if (debt >= 50000) return 300;
    if (debt >= 25000) return 200;
    if (debt >= 15000) return 150;
    if (debt >= 10000) return 100;
    return 75;
  }
}
