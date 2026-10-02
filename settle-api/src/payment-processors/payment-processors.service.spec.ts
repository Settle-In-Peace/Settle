import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProcessorsService } from './payment-processors.service';
import {
  PaymentProcessorProvider,
  ProcessorChargeResult,
  ProcessorName,
  ProcessorUpstreamError,
  WebhookVerificationError,
} from './payment-processor.interface';
import { ChargePaymentDto } from './dto/charge-payment.dto';
import { ProcessorPaymentStatus } from '../entities/processor-payment.entity';

const UUID = '11111111-2222-3333-4444-555555555555';

function makeConfig(values: Record<string, unknown> = {}): ConfigService {
  return { get: (key: string, def?: unknown) => values[key] ?? def } as any;
}

/** Minimal fake provider for router tests. */
function fakeProvider(
  name: ProcessorName,
  configured: boolean,
  chargeImpl?: jest.Mock,
): PaymentProcessorProvider & { charge: jest.Mock } {
  const charge =
    chargeImpl ??
    jest.fn(async (): Promise<ProcessorChargeResult> => ({
      status: 'approved',
      processorTxnId: `${name}-txn-1`,
      authCode: 'ABC123',
      responseCode: '1',
      responseText: 'SUCCESS',
      cardLast4: '1111',
      cardBrand: 'visa',
    }));
  return {
    name,
    charge,
    isConfigured: () => configured,
    hostedFieldsConfig: () => ({ kind: 'test', scriptUrl: 'https://example.test/x.js' }),
    refund: jest.fn(async () => ({ status: 'approved', processorTxnId: 'rf-1' })),
    void: jest.fn(async () => ({ status: 'approved', processorTxnId: 'vd-1' })),
    createRecurringPlan: jest.fn(async () => ({ planId: 'plan-1' })),
    chargeRecurring: jest.fn(async () => ({ status: 'approved' })),
    verifyWebhook: jest.fn(),
    parseWebhook: jest.fn(() => ({ eventType: 'test' })),
  } as any;
}

function makeRepo() {
  const rows: any[] = [];
  return {
    rows,
    create: (x: any) => ({ ...x }),
    save: jest.fn(async (x: any) => {
      if (!x.id) x.id = `pay-${rows.length + 1}`;
      rows.push(x);
      return x;
    }),
    findOne: jest.fn(async ({ where }: any) =>
      rows.find(
        (r) =>
          (where.id && r.id === where.id) ||
          (where.idempotencyKey && r.idempotencyKey === where.idempotencyKey) ||
          (where.processorTxnId && r.processorTxnId === where.processorTxnId),
      ) ?? null,
    ),
    find: jest.fn(async () => rows),
  };
}

function makeDto(overrides: Partial<ChargePaymentDto> = {}): ChargePaymentDto {
  return {
    collectionAccountId: UUID,
    amountCents: 5000,
    paymentToken: 'tok_abc123',
    disclosureAcknowledged: true,
    ...overrides,
  } as ChargePaymentDto;
}

function makeService(opts: {
  nmi?: PaymentProcessorProvider;
  authnet?: PaymentProcessorProvider;
  stripe?: PaymentProcessorProvider;
  config?: Record<string, unknown>;
  repo?: any;
}) {
  const repo = opts.repo ?? makeRepo();
  const service = new PaymentProcessorsService(
    makeConfig(opts.config),
    opts.nmi ?? fakeProvider('nmi', false),
    opts.authnet ?? fakeProvider('authorizenet', false),
    opts.stripe ?? fakeProvider('stripe', false),
    repo as any,
  );
  return { service, repo };
}

describe('PaymentProcessorsService (router)', () => {
  describe('PCI: no-PAN enforcement', () => {
    it.each([
      ['cardNumber', '4111111111111111'],
      ['cvv', '123'],
      ['ccnum', '4111111111111111'],
      ['card_expiry', '12/28'],
    ])('rejects a payload containing "%s"', async (key, value) => {
      const nmi = fakeProvider('nmi', true);
      const { service } = makeService({ nmi });
      const dto = { ...makeDto(), [key]: value };
      await expect(service.charge(dto as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(nmi.charge).not.toHaveBeenCalled();
    });

    it('still accepts cardLast4/cardBrand metadata fields', async () => {
      const nmi = fakeProvider('nmi', true);
      const { service } = makeService({ nmi });
      const dto = { ...makeDto(), cardLast4: '1111', cardBrand: 'visa' } as any;
      const res = await service.charge(dto);
      expect(res.status).toBe(ProcessorPaymentStatus.APPROVED);
      expect(nmi.charge).toHaveBeenCalledTimes(1);
    });
  });

  describe('failover policy', () => {
    it('does NOT retry/fail over a declined card', async () => {
      const nmi = fakeProvider(
        'nmi',
        true,
        jest.fn(async () => ({
          status: 'declined' as const,
          processorTxnId: 'nmi-dec-1',
          responseCode: '2',
          responseText: 'DECLINED',
        })),
      );
      const authnet = fakeProvider('authorizenet', true);
      const { service } = makeService({ nmi, authnet });

      const res = await service.charge(makeDto());
      expect(res.status).toBe(ProcessorPaymentStatus.DECLINED);
      expect(res.processor).toBe('nmi');
      expect(nmi.charge).toHaveBeenCalledTimes(1);
      expect(authnet.charge).not.toHaveBeenCalled(); // no failover on decline
    });

    it('fails over to the next processor on upstream 5xx/timeout', async () => {
      const nmi = fakeProvider(
        'nmi',
        true,
        jest.fn(async () => {
          throw new ProcessorUpstreamError('nmi', 'gateway timeout', 502);
        }),
      );
      const authnet = fakeProvider('authorizenet', true);
      const { service } = makeService({ nmi, authnet });

      const res = await service.charge(makeDto());
      expect(res.status).toBe(ProcessorPaymentStatus.APPROVED);
      expect(res.processor).toBe('authorizenet');
      expect(res.processorTxnId).toBe('authorizenet-txn-1');
      expect(nmi.charge).toHaveBeenCalledTimes(1);
      expect(authnet.charge).toHaveBeenCalledTimes(1);
    });

    it('respects PAYMENT_PROCESSOR_PRIORITY order', async () => {
      const nmi = fakeProvider('nmi', true);
      const authnet = fakeProvider('authorizenet', true);
      const { service } = makeService({
        nmi,
        authnet,
        config: { PAYMENT_PROCESSOR_PRIORITY: 'authorizenet,nmi' },
      });
      const res = await service.charge(makeDto());
      expect(res.processor).toBe('authorizenet');
      expect(nmi.charge).not.toHaveBeenCalled();
    });

    it('returns 503 (ServiceUnavailableException) when nothing is configured', async () => {
      const { service } = makeService({}); // all providers unconfigured
      await expect(service.charge(makeDto())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('disclosure / idempotency', () => {
    it('refuses to charge without disclosure acknowledgment', async () => {
      const nmi = fakeProvider('nmi', true);
      const { service } = makeService({ nmi });
      await expect(
        service.charge(makeDto({ disclosureAcknowledged: false })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(nmi.charge).not.toHaveBeenCalled();
    });

    it('records permitted + disclosureAcknowledgedAt on the charge', async () => {
      const nmi = fakeProvider('nmi', true);
      const { service } = makeService({ nmi });
      const res = await service.charge(makeDto());
      expect(res.permitted).toBe(true);
      expect(res.disclosureAcknowledgedAt).toBeInstanceOf(Date);
      expect(res.disclosureText).toContain('debt collector');
    });

    it('replays an existing record for a duplicate idempotency key', async () => {
      const nmi = fakeProvider('nmi', true);
      const { service } = makeService({ nmi });
      const first = await service.charge(makeDto({ idempotencyKey: 'idem-1' }));
      const second = await service.charge(makeDto({ idempotencyKey: 'idem-1' }));
      expect(second.id).toBe(first.id);
      expect(nmi.charge).toHaveBeenCalledTimes(1);
    });
  });

  describe('webhooks', () => {
    it('propagates signature verification failures (fail-closed)', async () => {
      const nmi = fakeProvider('nmi', true);
      nmi.verifyWebhook = jest.fn(() => {
        throw new WebhookVerificationError('nmi');
      });
      const { service } = makeService({ nmi });
      await expect(
        service.handleWebhook('nmi', '{}', 't=x,s=bad'),
      ).rejects.toBeInstanceOf(WebhookVerificationError);
    });
  });
});
