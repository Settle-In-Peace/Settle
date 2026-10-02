import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { createHmac } from 'crypto';
import { safeEqual } from '../payment-processor.utils';

/**
 * Authorize.Net adapter — second high-risk-friendly processor option.
 *
 * UNTESTED: implemented against the public Authorize.Net API spec
 * (createTransactionRequest on /xml/v1/request.api, Accept.js opaqueData
 * tokens, X-ANET-SIGNATURE webhooks). Verify against a real
 * sandbox.authorize.net account before relying on it — field-level edge
 * cases (partial reversals, eCheck, ARB subscription ids) are marked TODO.
 *
 * PCI posture: Accept.js (hosted fields) produces opaqueData
 * { dataDescriptor, dataValue } in the debtor's browser; this server only
 * ever sees `dataValue` (paymentToken). Never send cardNumber/expiration
 * fields from this adapter.
 *
 * Env:
 *   AUTHNET_API_LOGIN_ID, AUTHNET_TRANSACTION_KEY  (required)
 *   AUTHNET_CLIENT_KEY                             (Accept.js public key)
 *   AUTHNET_SIGNATURE_KEY                          (webhook HMAC-SHA512)
 *   AUTHNET_ENV=sandbox|production
 *   AUTHNET_API_BASE_URL                           (full override)
 */
@Injectable()
export class AuthorizeNetProvider implements PaymentProcessorProvider {
  readonly name = 'authorizenet' as const;
  private readonly logger = new Logger(AuthorizeNetProvider.name);

  constructor(private readonly config: ConfigService) {}

  get environment(): 'sandbox' | 'production' {
    return this.config.get<string>('AUTHNET_ENV', 'sandbox') === 'production'
      ? 'production'
      : 'sandbox';
  }

  private get baseUrl(): string {
    const def =
      this.environment === 'production'
        ? 'https://api.authorize.net'
        : 'https://apitest.authorize.net';
    return this.config
      .get<string>('AUTHNET_API_BASE_URL', def)
      .replace(/\/$/, '');
  }

  private get apiLoginId(): string {
    return this.config.get<string>('AUTHNET_API_LOGIN_ID', '');
  }

  private get transactionKey(): string {
    return this.config.get<string>('AUTHNET_TRANSACTION_KEY', '');
  }

  private get clientKey(): string {
    return this.config.get<string>('AUTHNET_CLIENT_KEY', '');
  }

  private get signatureKey(): string {
    return this.config.get<string>('AUTHNET_SIGNATURE_KEY', '');
  }

  isConfigured(): boolean {
    return Boolean(this.apiLoginId && this.transactionKey);
  }

  private get timeoutMs(): number {
    return this.config.get<number>('AUTHNET_TIMEOUT_MS', 15_000);
  }

  private get maxRetries(): number {
    return this.config.get<number>('AUTHNET_MAX_RETRIES', 2);
  }

  // ── HTTP plumbing ───────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async call(
    rootKey: string,
    payload: Record<string, any>,
    attempt = 0,
  ): Promise<Record<string, any>> {
    if (!this.isConfigured()) {
      throw new ProcessorNotConfiguredError(
        this.name,
        'Set AUTHNET_API_LOGIN_ID and AUTHNET_TRANSACTION_KEY.',
      );
    }
    const url = `${this.baseUrl}/xml/v1/request.api`;
    const body = JSON.stringify({
      [rootKey]: {
        merchantAuthentication: {
          name: this.apiLoginId,
          transactionKey: this.transactionKey,
        },
        ...payload,
      },
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      // NOTE: body carries credentials — never log it.
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      if (attempt < this.maxRetries) {
        const backoff = 250 * 2 ** attempt;
        this.logger.warn(
          `AuthNet ${rootKey} network${isTimeout ? ' timeout' : ''} error — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
        );
        await this.sleep(backoff);
        return this.call(rootKey, payload, attempt + 1);
      }
      throw new ProcessorUpstreamError(
        this.name,
        `unreachable after ${attempt + 1} attempt(s): ${isTimeout ? 'timeout' : (err as Error).message}`,
      );
    }
    clearTimeout(timer);

    const text = await res.text();
    let parsed: Record<string, any> = {};
    try {
      // Authorize.Net emits a UTF-8 BOM on some endpoints — strip it.
      parsed = JSON.parse(text.replace(/^﻿/, ''));
    } catch {
      /* non-JSON body — handled below */
    }

    if (res.ok) return parsed;

    if (res.status >= 400 && res.status < 500) {
      // Deterministic rejection — never retry, never fail over.
      this.logger.warn(`AuthNet ${rootKey} rejected (${res.status})`);
      return parsed;
    }

    if (attempt < this.maxRetries) {
      const backoff = 250 * 2 ** attempt;
      this.logger.warn(
        `AuthNet ${rootKey} -> ${res.status} — retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms`,
      );
      await this.sleep(backoff);
      return this.call(rootKey, payload, attempt + 1);
    }
    throw new ProcessorUpstreamError(
      this.name,
      `${rootKey} failed (${res.status}) after ${attempt + 1} attempt(s)`,
      res.status,
    );
  }

  private mapResult(raw: Record<string, any>): ProcessorChargeResult {
    const txn = raw.transactionResponse ?? {};
    const responseCode = String(txn.responseCode ?? raw.responseCode ?? '');
    const topErr = raw.messages?.message?.[0];
    const txnErr = txn.errors?.error?.[0];
    const cardType = txn.accountType; // e.g. "Visa"
    const accountNumber = txn.accountNumber; // masked, e.g. "XXXX1111"
    const last4 =
      typeof accountNumber === 'string'
        ? accountNumber.replace(/\D/g, '').slice(-4)
        : undefined;

    const base = {
      processorTxnId: txn.transId != null ? String(txn.transId) : undefined,
      authCode: txn.authCode,
      responseCode,
      responseText:
        txnErr?.errorText ??
        txn.messages?.message?.[0]?.description ??
        topErr?.text,
      avsResponse: txn.avsResultCode,
      cvvResponse: txn.cvvResultCode,
      cardBrand: cardType,
      cardLast4: last4 && last4.length === 4 ? last4 : undefined,
      raw,
    };

    if (responseCode === '1') return { ...base, status: 'approved' };
    if (responseCode === '2' || responseCode === '4')
      return { ...base, status: 'declined' };
    return { ...base, status: 'error' };
  }

  // ── PaymentProcessorProvider ───────────────────────────────────────────

  hostedFieldsConfig(): HostedFieldsConfig {
    if (!this.isConfigured()) {
      throw new ProcessorNotConfiguredError(this.name);
    }
    return {
      kind: 'acceptjs',
      scriptUrl:
        this.environment === 'production'
          ? 'https://js.authorize.net/v1/Accept.js'
          : 'https://jstest.authorize.net/v1/Accept.js',
      clientKey: this.clientKey || undefined,
      apiLoginId: this.apiLoginId || undefined,
      variant: 'inline',
    };
  }

  async charge(req: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    if (!req.paymentToken && !req.vaultId) {
      throw new ProcessorUpstreamError(
        this.name,
        'charge requires paymentToken (Accept.js opaqueData value) or vaultId',
      );
    }
    const amount = (Math.round(req.amountCents) / 100).toFixed(2);
    const payment = req.vaultId
      ? { customerProfileId: req.vaultId } // TODO(authnet): CIM profile shape — verify
      : {
          opaqueData: {
            dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
            dataValue: req.paymentToken,
          },
        };
    const raw = await this.call('createTransactionRequest', {
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount,
        payment,
        ...(req.orderId || req.description
          ? {
              order: {
                ...(req.orderId ? { invoiceNumber: req.orderId.slice(0, 20) } : {}),
                ...(req.description ? { description: req.description.slice(0, 255) } : {}),
              },
            }
          : {}),
        ...(req.email ? { customer: { email: req.email } } : {}),
      },
    });
    return this.mapResult(raw);
  }

  async refund(req: ProcessorRefundRequest): Promise<ProcessorChargeResult> {
    // AuthNet refundTransaction requires the original card's last4 and a
    // masked expiry ('XXXX') — we persist last4 on the charge record.
    const raw = await this.call('createTransactionRequest', {
      transactionRequest: {
        transactionType: 'refundTransaction',
        ...(req.amountCents != null
          ? { amount: (Math.round(req.amountCents) / 100).toFixed(2) }
          : {}),
        payment: {
          creditCard: {
            cardNumber: req.cardLast4 ?? 'XXXX',
            expirationDate: 'XXXX',
          },
        },
        refTransId: req.processorTxnId,
      },
    });
    return this.mapResult(raw);
  }

  async void(req: ProcessorVoidRequest): Promise<ProcessorChargeResult> {
    const raw = await this.call('createTransactionRequest', {
      transactionRequest: {
        transactionType: 'voidTransaction',
        refTransId: req.processorTxnId,
      },
    });
    return this.mapResult(raw);
  }

  /**
   * Recurring via ARB (ARBCreateSubscriptionRequest). Requires a stored
   * payment profile or an opaqueData token. TODO(authnet): verify interval
   * mapping + profile creation against a sandbox account — UNTESTED.
   */
  async createRecurringPlan(
    req: RecurringPlanRequest,
  ): Promise<RecurringPlanResult> {
    if (!req.paymentToken && !req.vaultId) {
      throw new ProcessorUpstreamError(
        this.name,
        'createRecurringPlan requires paymentToken or vaultId',
      );
    }
    const interval =
      req.frequency === 'weekly'
        ? { length: 7, unit: 'days' }
        : req.frequency === 'biweekly'
          ? { length: 14, unit: 'days' }
          : { length: 1, unit: 'months' };

    const raw = await this.call('ARBCreateSubscriptionRequest', {
      subscription: {
        name: (req.orderId ?? 'settle-plan').slice(0, 50),
        paymentSchedule: {
          interval,
          startDate: req.startDate,
          totalOccurrences: req.numberOfPayments ?? 9999,
        },
        amount: (Math.round(req.amountCents) / 100).toFixed(2),
        payment: req.paymentToken
          ? {
              opaqueData: {
                dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
                dataValue: req.paymentToken,
              },
            }
          : { customerProfileId: req.vaultId },
      },
    });
    return {
      planId: raw.subscriptionId != null ? String(raw.subscriptionId) : '',
      vaultId: req.vaultId,
      raw,
    };
  }

  /**
   * AuthNet charges a stored customer profile — expects vaultId in
   * "profileId:paymentProfileId" form. TODO(authnet): UNTESTED.
   */
  async chargeRecurring(
    vaultId: string,
    amountCents: number,
  ): Promise<ProcessorChargeResult> {
    const [customerProfileId, customerPaymentProfileId] = vaultId.split(':');
    const raw = await this.call('createTransactionRequest', {
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: (Math.round(amountCents) / 100).toFixed(2),
        profile: {
          customerProfileId,
          paymentProfile: { paymentProfileId: customerPaymentProfileId },
        },
      },
    });
    return this.mapResult(raw);
  }

  // ── Webhooks ────────────────────────────────────────────────────────────

  /**
   * AuthNet signs webhooks with `X-ANET-SIGNATURE: sha512=<hmac-hex>` where
   * hmac = HMAC-SHA512(AUTHNET_SIGNATURE_KEY, raw body). UNTESTED — verify
   * header casing/format against live deliveries.
   */
  verifyWebhook(rawBody: Buffer | string, signatureHeader?: string): void {
    if (!this.signatureKey) {
      throw new ProcessorNotConfiguredError(
        this.name,
        'AUTHNET_SIGNATURE_KEY is not set.',
      );
    }
    const header = signatureHeader ?? '';
    const match = /sha512=(.*)/i.exec(header);
    if (!match) {
      throw new WebhookVerificationError(
        this.name,
        'missing or malformed X-ANET-SIGNATURE header',
      );
    }
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const expected = createHmac('sha512', this.signatureKey)
      .update(bodyStr)
      .digest('hex')
      .toUpperCase();
    if (!safeEqual(expected, match[1].toUpperCase())) {
      throw new WebhookVerificationError(this.name);
    }
  }

  parseWebhook(rawBody: Buffer | string): ProcessorWebhookEvent {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    let evt: any;
    try {
      evt = JSON.parse(bodyStr);
    } catch {
      throw new WebhookVerificationError(this.name, 'webhook body is not JSON');
    }
    const eventType: string = evt.eventType ?? evt.event_type ?? '';
    const payload = evt.payload ?? {};
    let status: ProcessorWebhookEvent['status'] = 'unknown';
    if (eventType.includes('authCapture.created')) status = 'approved';
    else if (eventType.includes('refund.created')) status = 'refunded';
    else if (eventType.includes('void.created')) status = 'voided';
    else if (eventType.includes('declined')) status = 'declined';

    return {
      eventType,
      eventId: evt.notificationId ?? evt.eventId,
      processorTxnId: payload.id != null ? String(payload.id) : undefined,
      status,
      amountCents:
        typeof payload.authAmount === 'number'
          ? Math.round(payload.authAmount * 100)
          : undefined,
      raw: evt,
    };
  }
}
