import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProcessorPayment,
  ProcessorPaymentStatus,
  ProcessorPaymentType,
} from '../entities/processor-payment.entity';
import {
  PaymentProcessorProvider,
  ProcessorChargeRequest,
  ProcessorChargeResult,
  ProcessorName,
  ProcessorNotConfiguredError,
  ProcessorUpstreamError,
  ProcessorWebhookEvent,
  WebhookVerificationError,
} from './payment-processor.interface';
import {
  assertNoSensitiveCardData,
  sanitizeGatewayResponse,
} from './payment-processor.utils';
import { ChargePaymentDto } from './dto/charge-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { NmiProvider } from './providers/nmi.provider';
import { AuthorizeNetProvider } from './providers/authorizenet.provider';
import { StripeProcessorProvider } from './providers/stripe.processor-provider';

export const DEFAULT_DISCLOSURE_TEXT =
  'By submitting this payment you authorize us to charge the payment method provided for the amount shown. Any convenience fee, if permitted in your state, is disclosed and included in the total. This communication is from a debt collector.';

export interface ProcessorStatusEntry {
  name: ProcessorName;
  configured: boolean;
  environment?: string;
  priority: number; // 0-based position in PAYMENT_PROCESSOR_PRIORITY
  hostedFields?: Record<string, any>;
  capabilities: string[];
}

/**
 * Processor router — picks a configured provider by PAYMENT_PROCESSOR_PRIORITY
 * (default "nmi,authorizenet,stripe").
 *
 * Failover policy (deliberately strict):
 *   - ProcessorUpstreamError (network/timeout/HTTP 5xx) → try next processor.
 *   - Declined card / gateway-level rejection → final result, NEVER retried
 *     or replayed — the same card data on another MID would just decline again
 *     and could double-charge once processors recover.
 *   - Note that tokens are processor-specific (a Collect.js token cannot be
 *     charged through AuthNet); failover exists for card-on-file/vault charges
 *     and upstream outages where the caller supplies a portable reference.
 */
@Injectable()
export class PaymentProcessorsService {
  private readonly logger = new Logger(PaymentProcessorsService.name);
  private readonly providers = new Map<ProcessorName, PaymentProcessorProvider>();

  constructor(
    private readonly config: ConfigService,
    nmi: NmiProvider,
    authorizenet: AuthorizeNetProvider,
    stripe: StripeProcessorProvider,
    @InjectRepository(ProcessorPayment)
    private readonly paymentsRepository: Repository<ProcessorPayment>,
  ) {
    this.providers.set('nmi', nmi);
    this.providers.set('authorizenet', authorizenet);
    this.providers.set('stripe', stripe);
  }

  // ── Router ──────────────────────────────────────────────────────────────

  /** Ordered processor names per PAYMENT_PROCESSOR_PRIORITY. */
  get priorityOrder(): ProcessorName[] {
    const raw = this.config.get<string>(
      'PAYMENT_PROCESSOR_PRIORITY',
      'nmi,authorizenet,stripe',
    );
    const known = new Set(this.providers.keys());
    const ordered = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is ProcessorName => known.has(s as ProcessorName));
    // Append any configured-but-unlisted providers at the end (stable).
    for (const name of known) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered;
  }

  /** Configured providers in priority order (or just the pinned one). */
  private route(pin?: ProcessorName): PaymentProcessorProvider[] {
    const order = pin ? [pin] : this.priorityOrder;
    return order
      .map((name) => this.providers.get(name)!)
      .filter((p) => p.isConfigured());
  }

  // ── Status / health ────────────────────────────────────────────────────

  getStatus(): { priority: ProcessorName[]; processors: ProcessorStatusEntry[] } {
    const order = this.priorityOrder;
    const processors = order.map((name, i) => {
      const p = this.providers.get(name)!;
      const entry: ProcessorStatusEntry = {
        name,
        configured: p.isConfigured(),
        priority: i,
        capabilities: ['sale', 'refund', 'void', 'hosted_fields'],
      };
      const env = (p as any).environment;
      if (env) entry.environment = env;
      if (name === 'nmi' || name === 'authorizenet') {
        entry.capabilities.push('recurring', 'webhooks');
      }
      if (p.isConfigured()) {
        try {
          entry.hostedFields = { ...p.hostedFieldsConfig() };
        } catch {
          /* leave undefined */
        }
      }
      return entry;
    });
    return { priority: order, processors };
  }

  // ── Charge ──────────────────────────────────────────────────────────────

  async charge(dto: ChargePaymentDto, userId?: string): Promise<ProcessorPayment> {
    // PCI fail-closed: reject any payload carrying cardholder-data fields.
    assertNoSensitiveCardData(dto);

    if (!dto.paymentToken && !dto.vaultId) {
      throw new BadRequestException(
        'paymentToken or vaultId is required — raw card data is never accepted.',
      );
    }
    if (!dto.disclosureAcknowledged) {
      throw new BadRequestException(
        'disclosureAcknowledged must be true — the debtor must be shown and accept the payment disclosure before charging (FDCPA/state rules).',
      );
    }

    // Idempotency: replay returns the original record unchanged.
    if (dto.idempotencyKey) {
      const existing = await this.paymentsRepository.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const routed = this.route(dto.processor);
    if (!routed.length) {
      throw new ServiceUnavailableException(
        'No payment processor is configured. Set NMI_SECURITY_KEY / AUTHNET_* credentials.',
      );
    }

    const record = this.paymentsRepository.create({
      debtorId: dto.debtorId,
      collectionAccountId: dto.collectionAccountId,
      debtId: dto.debtId,
      paymentPlanId: dto.paymentPlanId,
      type: dto.vaultId && !dto.paymentToken
        ? ProcessorPaymentType.RECURRING_SALE
        : ProcessorPaymentType.SALE,
      status: ProcessorPaymentStatus.PENDING,
      amountCents: dto.amountCents,
      currency: dto.currency ?? 'usd',
      convenienceFeeCents: dto.convenienceFeeCents ?? 0,
      permitted: dto.disclosureAcknowledged === true,
      disclosureText: dto.disclosureText ?? DEFAULT_DISCLOSURE_TEXT,
      disclosureAcknowledgedAt: dto.disclosureAcknowledged ? new Date() : undefined,
      idempotencyKey: dto.idempotencyKey,
      initiatedBy: userId,
    });

    const req: ProcessorChargeRequest = {
      amountCents: dto.amountCents + (dto.convenienceFeeCents ?? 0),
      currency: dto.currency ?? 'usd',
      paymentToken: dto.paymentToken,
      vaultId: dto.vaultId,
      orderId: record.id,
      description: dto.description,
      email: dto.email,
      metadata: {
        collectionAccountId: dto.collectionAccountId,
        ...(dto.debtId ? { debtId: dto.debtId } : {}),
      },
    };

    let lastError: ProcessorUpstreamError | undefined;
    let result: ProcessorChargeResult | undefined;
    let usedProcessor: PaymentProcessorProvider | undefined;

    for (const provider of routed) {
      try {
        result = await provider.charge(req);
        usedProcessor = provider;
        break;
      } catch (err) {
        if (err instanceof ProcessorUpstreamError) {
          // 5xx/timeout only — try the next configured processor.
          this.logger.warn(
            `${provider.name} upstream failure — failing over (${err.message})`,
          );
          lastError = err;
          continue;
        }
        if (err instanceof ProcessorNotConfiguredError) continue;
        throw err;
      }
    }

    if (!result || !usedProcessor) {
      record.status = ProcessorPaymentStatus.ERROR;
      record.processor = routed[0].name;
      record.failureReason = lastError?.message ?? 'all processors failed';
      await this.paymentsRepository.save(record);
      throw new ServiceUnavailableException(
        `Payment could not be submitted — all processors unreachable (${lastError?.message ?? 'no result'}).`,
      );
    }

    record.processor = usedProcessor.name;
    record.status = result.status as ProcessorPaymentStatus;
    record.processorTxnId = result.processorTxnId;
    record.authCode = result.authCode;
    record.responseCode = result.responseCode;
    record.responseText = result.responseText?.slice(0, 255);
    record.avsResponse = result.avsResponse;
    record.cvvResponse = result.cvvResponse;
    record.cardBrand = result.cardBrand?.slice(0, 32);
    record.cardLast4 = result.cardLast4?.slice(-4);
    record.customerVaultId = result.vaultId;
    if (result.status === 'error' || result.status === 'declined') {
      record.failureReason = result.responseText?.slice(0, 500);
    }
    record.rawResponse = sanitizeGatewayResponse(result.raw);

    return this.paymentsRepository.save(record);
  }

  // ── Refund / void ──────────────────────────────────────────────────────

  async refund(dto: RefundPaymentDto, userId?: string): Promise<ProcessorPayment> {
    const original = await this.paymentsRepository.findOne({
      where: { id: dto.paymentId },
    });
    if (!original) throw new NotFoundException('Payment not found');
    if (original.status !== ProcessorPaymentStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot refund a payment with status "${original.status}"`,
      );
    }
    if (dto.amountCents != null && dto.amountCents > original.amountCents) {
      throw new BadRequestException('Refund exceeds original amount');
    }

    const provider = this.providers.get(original.processor as ProcessorName);
    if (!provider || !provider.isConfigured()) {
      throw new ServiceUnavailableException(
        `Processor "${original.processor}" is not configured.`,
      );
    }
    if (!original.processorTxnId) {
      throw new BadRequestException('Original payment has no processor transaction id');
    }

    const result = await provider.refund({
      processorTxnId: original.processorTxnId,
      amountCents: dto.amountCents,
      cardLast4: original.cardLast4,
      reason: dto.reason,
    });

    const record = this.paymentsRepository.create({
      debtorId: original.debtorId,
      collectionAccountId: original.collectionAccountId,
      debtId: original.debtId,
      paymentPlanId: original.paymentPlanId,
      parentPaymentId: original.id,
      processor: original.processor,
      type: ProcessorPaymentType.REFUND,
      status: (result.status === 'approved'
        ? ProcessorPaymentStatus.REFUNDED
        : result.status) as ProcessorPaymentStatus,
      amountCents: dto.amountCents ?? original.amountCents,
      currency: original.currency,
      processorTxnId: result.processorTxnId,
      authCode: result.authCode,
      responseCode: result.responseCode,
      responseText: result.responseText?.slice(0, 255),
      cardBrand: original.cardBrand,
      cardLast4: original.cardLast4,
      permitted: true,
      disclosureText: original.disclosureText,
      disclosureAcknowledgedAt: original.disclosureAcknowledgedAt,
      initiatedBy: userId,
      rawResponse: sanitizeGatewayResponse(result.raw),
      failureReason:
        result.status !== 'approved' ? result.responseText?.slice(0, 500) : undefined,
    });
    const saved = await this.paymentsRepository.save(record);

    if (result.status === 'approved') {
      original.status =
        dto.amountCents != null && dto.amountCents < original.amountCents
          ? ProcessorPaymentStatus.APPROVED // partial — keep approved
          : ProcessorPaymentStatus.REFUNDED;
      await this.paymentsRepository.save(original);
    }
    return saved;
  }

  async void(dto: VoidPaymentDto, userId?: string): Promise<ProcessorPayment> {
    const original = await this.paymentsRepository.findOne({
      where: { id: dto.paymentId },
    });
    if (!original) throw new NotFoundException('Payment not found');
    if (original.status !== ProcessorPaymentStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot void a payment with status "${original.status}"`,
      );
    }

    const provider = this.providers.get(original.processor as ProcessorName);
    if (!provider || !provider.isConfigured()) {
      throw new ServiceUnavailableException(
        `Processor "${original.processor}" is not configured.`,
      );
    }
    if (!original.processorTxnId) {
      throw new BadRequestException('Original payment has no processor transaction id');
    }

    const result = await provider.void({ processorTxnId: original.processorTxnId });

    const record = this.paymentsRepository.create({
      debtorId: original.debtorId,
      collectionAccountId: original.collectionAccountId,
      debtId: original.debtId,
      parentPaymentId: original.id,
      processor: original.processor,
      type: ProcessorPaymentType.VOID,
      status: (result.status === 'approved'
        ? ProcessorPaymentStatus.VOIDED
        : result.status) as ProcessorPaymentStatus,
      amountCents: original.amountCents,
      currency: original.currency,
      processorTxnId: result.processorTxnId,
      responseCode: result.responseCode,
      responseText: result.responseText?.slice(0, 255),
      cardBrand: original.cardBrand,
      cardLast4: original.cardLast4,
      permitted: true,
      initiatedBy: userId,
      rawResponse: sanitizeGatewayResponse(result.raw),
      failureReason:
        result.status !== 'approved' ? result.responseText?.slice(0, 500) : undefined,
    });
    const saved = await this.paymentsRepository.save(record);

    if (result.status === 'approved') {
      original.status = ProcessorPaymentStatus.VOIDED;
      await this.paymentsRepository.save(original);
    }
    return saved;
  }

  // ── History ─────────────────────────────────────────────────────────────

  getPaymentsForAccount(collectionAccountId: string): Promise<ProcessorPayment[]> {
    return this.paymentsRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  getPaymentsForDebt(debtId: string): Promise<ProcessorPayment[]> {
    return this.paymentsRepository.find({
      where: { debtId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ── Webhooks ────────────────────────────────────────────────────────────

  /**
   * Verify + ingest a processor webhook. Verification is fail-closed:
   * no configured secret → ProcessorNotConfiguredError (503 upstream);
   * bad signature → WebhookVerificationError (401 upstream).
   *
   * NOTE: HMAC verification needs the RAW body — main.ts must add
   * '/payment-processors/webhooks' to isRawBodyWebhookRoute (see README).
   */
  async handleWebhook(
    processorName: string,
    rawBody: Buffer | string,
    signatureHeader?: string,
  ): Promise<ProcessorWebhookEvent> {
    const provider = this.providers.get(processorName as ProcessorName);
    if (!provider) {
      throw new NotFoundException(`Unknown processor "${processorName}"`);
    }
    provider.verifyWebhook(rawBody, signatureHeader);
    const event = provider.parseWebhook(rawBody);

    if (event.processorTxnId && event.status && event.status !== 'unknown') {
      const payment = await this.paymentsRepository.findOne({
        where: { processorTxnId: event.processorTxnId },
      });
      if (payment && payment.status !== event.status) {
        payment.status = event.status as ProcessorPaymentStatus;
        payment.rawResponse = {
          ...(payment.rawResponse ?? {}),
          lastWebhook: { eventType: event.eventType, eventId: event.eventId },
        };
        await this.paymentsRepository.save(payment);
        this.logger.log(
          `Webhook ${processorName} ${event.eventType} → payment ${payment.id} = ${event.status}`,
        );
      }
    }
    return event;
  }
}
