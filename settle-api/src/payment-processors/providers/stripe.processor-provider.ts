import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  HostedFieldsConfig,
  PaymentProcessorProvider,
  ProcessorChargeRequest,
  ProcessorChargeResult,
  ProcessorNotConfiguredError,
  ProcessorRefundRequest,
  ProcessorUpstreamError,
  ProcessorVoidRequest,
  ProcessorWebhookEvent,
  RecurringPlanRequest,
  RecurringPlanResult,
  WebhookVerificationError,
} from '../payment-processor.interface';

/**
 * Stripe adapter for the processor router — LAST-RESORT fallback only.
 *
 * Debt collection is a high-risk MCC that Stripe generally will not board;
 * this adapter exists so PAYMENT_PROCESSOR_PRIORITY can include `stripe`
 * for merchants who DO have an approved Stripe account (e.g. for
 * non-collection payments). It is intentionally thin: charge a Stripe.js /
 * PaymentMethod token (pm_...), refund a PaymentIntent, "void" = cancel an
 * uncaptured PaymentIntent.
 *
 * Separate from src/stripe/StripeService (which owns subscriptions/lead
 * purchases) — this module does not import it to keep the high-risk layer
 * decoupled.
 */
@Injectable()
export class StripeProcessorProvider implements PaymentProcessorProvider {
  readonly name = 'stripe' as const;
  private readonly logger = new Logger(StripeProcessorProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get secretKey(): string {
    return this.config.get<string>('STRIPE_SECRET_KEY', '');
  }

  private get webhookSecret(): string {
    return this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  private client(): Stripe {
    if (!this.isConfigured()) {
      throw new ProcessorNotConfiguredError(
        this.name,
        'Set STRIPE_SECRET_KEY.',
      );
    }
    return new Stripe(this.secretKey, { apiVersion: '2026-06-24.dahlia' });
  }

  private wrap<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((err: any) => {
      // Stripe card declines are results, not failover triggers.
      if (err?.type === 'StripeCardError' || err?.code === 'card_declined') {
        return {
          status: 'declined',
          responseCode: err.decline_code ?? err.code,
          responseText: err.message,
          raw: { decline_code: err.decline_code, code: err.code },
        } as T;
      }
      // 5xx / rate-limit / connection errors are failover-eligible.
      const status = err?.statusCode as number | undefined;
      if (
        err?.type === 'StripeAPIError' ||
        err?.type === 'StripeConnectionError' ||
        (status != null && status >= 500)
      ) {
        throw new ProcessorUpstreamError(
          this.name,
          err?.message ?? 'Stripe upstream error',
          status,
        );
      }
      // Deterministic API/validation error — surface as an error result.
      return {
        status: 'error',
        responseCode: err?.code,
        responseText: err?.message,
      } as T;
    });
  }

  hostedFieldsConfig(): HostedFieldsConfig {
    if (!this.isConfigured()) {
      throw new ProcessorNotConfiguredError(this.name);
    }
    return {
      kind: 'stripejs',
      scriptUrl: 'https://js.stripe.com/v3/',
      tokenizationKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY', '') || undefined,
      variant: 'inline',
    };
  }

  async charge(req: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    const paymentMethod = req.paymentToken ?? req.vaultId;
    if (!paymentMethod) {
      throw new ProcessorUpstreamError(
        this.name,
        'charge requires a Stripe payment_method id (pm_…)',
      );
    }
    return this.wrap(async () => {
      const pi = await this.client().paymentIntents.create({
        amount: Math.round(req.amountCents),
        currency: (req.currency ?? 'usd').toLowerCase(),
        payment_method: paymentMethod,
        confirm: true,
        payment_method_types: ['card'],
        description: req.description,
        receipt_email: req.email,
        metadata: req.metadata,
      });
      const card = pi.latest_charge
        ? (pi.latest_charge as Stripe.Charge).payment_method_details?.card
        : undefined;
      return {
        status: pi.status === 'succeeded' ? 'approved' : 'error',
        processorTxnId: pi.id,
        responseCode: pi.status,
        responseText: pi.last_payment_error?.message,
        cardBrand: card?.brand,
        cardLast4: card?.last4,
        raw: { id: pi.id, status: pi.status, amount: pi.amount },
      } as ProcessorChargeResult;
    });
  }

  async refund(req: ProcessorRefundRequest): Promise<ProcessorChargeResult> {
    return this.wrap(async () => {
      const refund = await this.client().refunds.create({
        payment_intent: req.processorTxnId,
        amount: req.amountCents,
        reason: 'requested_by_customer',
      });
      return {
        status: refund.status === 'failed' ? 'error' : 'approved',
        processorTxnId: refund.id,
        responseCode: refund.status ?? undefined,
        raw: { id: refund.id, status: refund.status },
      } as ProcessorChargeResult;
    });
  }

  /** Void = cancel an uncaptured/unconfirmed PaymentIntent. */
  async void(req: ProcessorVoidRequest): Promise<ProcessorChargeResult> {
    return this.wrap(async () => {
      const pi = await this.client().paymentIntents.cancel(req.processorTxnId);
      return {
        status: pi.status === 'canceled' ? 'approved' : 'error',
        processorTxnId: pi.id,
        responseCode: pi.status,
        raw: { id: pi.id, status: pi.status },
      } as ProcessorChargeResult;
    });
  }

  async createRecurringPlan(
    _req: RecurringPlanRequest,
  ): Promise<RecurringPlanResult> {
    // Recurring billing for collections belongs on the high-risk processors.
    // Not implemented — throw a non-failoverable error result upstream.
    throw new ProcessorUpstreamError(
      this.name,
      'Recurring plans are not supported by the Stripe processor adapter',
    );
  }

  async chargeRecurring(
    vaultId: string,
    amountCents: number,
  ): Promise<ProcessorChargeResult> {
    return this.charge({
      amountCents,
      vaultId,
      description: 'Recurring charge',
    });
  }

  verifyWebhook(rawBody: Buffer | string, signatureHeader?: string): void {
    if (!this.webhookSecret) {
      throw new ProcessorNotConfiguredError(
        this.name,
        'STRIPE_WEBHOOK_SECRET is not set.',
      );
    }
    try {
      this.client().webhooks.constructEvent(
        Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody),
        signatureHeader ?? '',
        this.webhookSecret,
      );
    } catch {
      throw new WebhookVerificationError(this.name);
    }
  }

  parseWebhook(rawBody: Buffer | string): ProcessorWebhookEvent {
    const evt = JSON.parse(
      Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody,
    ) as Stripe.Event;
    const obj: any = evt.data?.object ?? {};
    let status: ProcessorWebhookEvent['status'] = 'unknown';
    if (evt.type === 'payment_intent.succeeded') status = 'approved';
    else if (evt.type === 'payment_intent.payment_failed') status = 'declined';
    else if (evt.type === 'charge.refunded') status = 'refunded';
    return {
      eventType: evt.type,
      eventId: evt.id,
      processorTxnId: obj.id ?? obj.payment_intent,
      status,
      amountCents: obj.amount ?? obj.amount_refunded,
      raw: { id: evt.id, type: evt.type },
    };
  }
}
