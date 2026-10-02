import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { NmiProvider } from './nmi.provider';
import {
  ProcessorNotConfiguredError,
  ProcessorUpstreamError,
  WebhookVerificationError,
} from '../payment-processor.interface';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    NMI_ENV: 'sandbox',
    NMI_SECURITY_KEY: 'test-secret-key',
    NMI_PUBLIC_KEY: 'pub-key-123',
    NMI_TIMEOUT_MS: 5000,
    NMI_MAX_RETRIES: 1,
    ...overrides,
  };
  return { get: (key: string, def?: unknown) => values[key] ?? def } as any;
}

function nmiResponse(fields: Record<string, string>, status = 200): Response {
  return new Response(new URLSearchParams(fields).toString(), {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

const APPROVED = {
  response: '1',
  responsetext: 'SUCCESS',
  authcode: 'ABC123',
  transactionid: '9876543210',
  avsresponse: 'Y',
  cvvresponse: 'M',
  cc_number: 'XXXXXXXXXXXX1111',
  card_type: 'visa',
};

describe('NmiProvider', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reports unconfigured without NMI_SECURITY_KEY', () => {
    const p = new NmiProvider(makeConfig({ NMI_SECURITY_KEY: '' }));
    expect(p.isConfigured()).toBe(false);
  });

  it('fails closed instead of calling the gateway when unconfigured', async () => {
    const p = new NmiProvider(makeConfig({ NMI_SECURITY_KEY: '' }));
    await expect(
      p.charge({ amountCents: 1000, paymentToken: 'tok' }),
    ).rejects.toBeInstanceOf(ProcessorNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a sale to /api/transact.php with a payment_token (never PAN)', async () => {
    fetchMock.mockResolvedValue(nmiResponse(APPROVED));
    const p = new NmiProvider(makeConfig());
    const res = await p.charge({
      amountCents: 12345,
      paymentToken: 'collectjs-token',
      description: 'Account payment',
    });

    expect(res.status).toBe('approved');
    expect(res.processorTxnId).toBe('9876543210');
    expect(res.cardLast4).toBe('1111');
    expect(res.cardBrand).toBe('visa');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.nmi.com/api/transact.php');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('type')).toBe('sale');
    expect(body.get('amount')).toBe('123.45');
    expect(body.get('payment_token')).toBe('collectjs-token');
    expect(body.get('security_key')).toBe('test-secret-key');
    // PAN fields must never appear in what we send
    expect(body.get('ccnumber')).toBeNull();
    expect(body.get('cvv')).toBeNull();
  });

  it('uses secure.nmi.com in production', async () => {
    fetchMock.mockResolvedValue(nmiResponse(APPROVED));
    const p = new NmiProvider(makeConfig({ NMI_ENV: 'production' }));
    await p.charge({ amountCents: 100, paymentToken: 't' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://secure.nmi.com/api/transact.php',
    );
  });

  it('maps response=2 to declined (a result, not an exception)', async () => {
    fetchMock.mockResolvedValue(
      nmiResponse({ response: '2', responsetext: 'DECLINED', transactionid: '42' }),
    );
    const p = new NmiProvider(makeConfig());
    const res = await p.charge({ amountCents: 100, paymentToken: 't' });
    expect(res.status).toBe('declined');
    expect(res.responseText).toBe('DECLINED');
  });

  it('maps response=3 to error result (deterministic, no retry)', async () => {
    fetchMock.mockResolvedValue(
      nmiResponse({ response: '3', responsetext: 'Duplicate transaction' }),
    );
    const p = new NmiProvider(makeConfig());
    const res = await p.charge({ amountCents: 100, paymentToken: 't' });
    expect(res.status).toBe('error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transport-level 5xx then throws ProcessorUpstreamError', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }));
    const p = new NmiProvider(makeConfig());
    await expect(
      p.charge({ amountCents: 100, paymentToken: 't' }),
    ).rejects.toBeInstanceOf(ProcessorUpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 + NMI_MAX_RETRIES
  });

  it('sends void/refund with transactionid only', async () => {
    fetchMock.mockImplementation(async () => nmiResponse(APPROVED));
    const p = new NmiProvider(makeConfig());
    await p.void({ processorTxnId: '9876543210' });
    await p.refund({ processorTxnId: '9876543210', amountCents: 500 });

    const voidBody = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(voidBody.get('type')).toBe('void');
    expect(voidBody.get('transactionid')).toBe('9876543210');

    const refundBody = new URLSearchParams(fetchMock.mock.calls[1][1].body);
    expect(refundBody.get('type')).toBe('refund');
    expect(refundBody.get('amount')).toBe('5.00');
  });

  it('exposes Collect.js hosted-fields config with the public key only', () => {
    const p = new NmiProvider(makeConfig());
    const cfg = p.hostedFieldsConfig();
    expect(cfg.kind).toBe('collectjs');
    expect(cfg.scriptUrl).toBe('https://sandbox.nmi.com/token/Collect.js');
    expect(cfg.tokenizationKey).toBe('pub-key-123');
  });

  describe('webhooks', () => {
    const secret = 'whsec-signing-key';
    const body = JSON.stringify({
      event_id: 'evt-1',
      event_type: 'transaction.sale.success',
      event_body: { transaction: { transaction_id: '9876543210', amount: '12.34' } },
    });

    function sign(nonce: string, payload: string): string {
      const sig = createHmac('sha256', secret)
        .update(`${nonce}.${payload}`)
        .digest('hex');
      return `t=${nonce},s=${sig}`;
    }

    it('verifies a valid Webhook-Signature header', () => {
      const p = new NmiProvider(makeConfig({ NMI_WEBHOOK_SECRET: secret }));
      expect(() =>
        p.verifyWebhook(body, sign('nonce123', body)),
      ).not.toThrow();
    });

    it('rejects an invalid signature', () => {
      const p = new NmiProvider(makeConfig({ NMI_WEBHOOK_SECRET: secret }));
      expect(() => p.verifyWebhook(body, 't=n,s=deadbeef')).toThrow(
        WebhookVerificationError,
      );
    });

    it('rejects when NMI_WEBHOOK_SECRET is not configured (fail-closed)', () => {
      const p = new NmiProvider(makeConfig({ NMI_WEBHOOK_SECRET: '' }));
      expect(() => p.verifyWebhook(body, sign('n', body))).toThrow(
        ProcessorNotConfiguredError,
      );
    });

    it('parses a sale.success event into an approved status', () => {
      const p = new NmiProvider(makeConfig({ NMI_WEBHOOK_SECRET: secret }));
      const evt = p.parseWebhook(body);
      expect(evt.eventType).toBe('transaction.sale.success');
      expect(evt.processorTxnId).toBe('9876543210');
      expect(evt.status).toBe('approved');
      expect(evt.amountCents).toBe(1234);
    });
  });
});
