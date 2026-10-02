import * as crypto from 'crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { LeadVendorWebhookController } from './lead-vendor-webhook.controller';

const SECRET = 'whsec_boberdoo';

function makeController(opts: { secret?: string | null } = {}) {
  const service = {
    ingestWebhook: jest.fn(async () => ({
      batch: { id: 'batch-1', imported: 1, duplicates: 0, invalid: 0 },
    })),
  };
  const registry = {
    webhookSecret: jest.fn(async () =>
      opts.secret === undefined ? SECRET : opts.secret,
    ),
  };
  return {
    controller: new LeadVendorWebhookController(service as any, registry as any),
    service,
    registry,
  };
}

function req(body: any, headers: Record<string, string> = {}) {
  return {
    headers: { 'content-type': 'application/json', ...headers },
    rawBody: undefined,
  } as any;
}

function signatureFor(text: string): string {
  return crypto.createHmac('sha256', SECRET).update(text, 'utf8').digest('hex');
}

describe('LeadVendorWebhookController', () => {
  const body = { leads: [{ firstName: 'Jane', phone: '+15551234567' }] };

  it('rejects requests with a bad signature (401)', async () => {
    const { controller, service } = makeController();
    await expect(
      controller.handleWebhook(
        req(body, { 'x-lead-vendor-signature': 'deadbeef' }),
        'boberdoo',
        body,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.ingestWebhook).not.toHaveBeenCalled();
  });

  it('rejects unsigned requests (401)', async () => {
    const { controller, service } = makeController();
    await expect(
      controller.handleWebhook(req(body), 'boberdoo', body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.ingestWebhook).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the vendor has no webhook secret', async () => {
    const { controller } = makeController({ secret: null });
    await expect(
      controller.handleWebhook(
        req(body, { 'x-lead-vendor-signature': 'abc' }),
        'boberdoo',
        body,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('requires a vendor identifier', async () => {
    const { controller } = makeController();
    await expect(
      controller.handleWebhook(req(body), undefined, body),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a correctly-signed webhook and ingests', async () => {
    const { controller, service } = makeController();
    const sig = signatureFor(JSON.stringify(body));
    const result = await controller.handleWebhook(
      req(body, { 'x-lead-vendor-signature': sig }),
      'boberdoo',
      body,
    );
    expect(result).toEqual({
      received: true,
      batchId: 'batch-1',
      imported: 1,
      duplicates: 0,
      invalid: 0,
    });
    expect(service.ingestWebhook).toHaveBeenCalledWith('boberdoo', body);
  });

  it('verifies over the exact raw bytes when rawBody is present', async () => {
    const { controller } = makeController();
    const rawText = '{"leads":[{"firstName":"Jane","phone":"+15551234567"}]}';
    // JSON.stringify would produce different bytes (no spaces removed etc.) —
    // signing must use the raw text.
    const sig = signatureFor(rawText);
    const result = await controller.handleWebhook(
      {
        headers: {
          'content-type': 'application/json',
          'x-lead-vendor-signature': sig,
        },
        rawBody: Buffer.from(rawText, 'utf8'),
      } as any,
      'boberdoo',
      Buffer.from(rawText, 'utf8'),
    );
    expect(result.received).toBe(true);
  });
});
