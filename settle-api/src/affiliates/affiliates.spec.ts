import * as crypto from 'crypto';
import { verifyPostbackToken, verifyPostbackSignature } from './postback-auth.util';
import { AffiliatesService } from './affiliates.service';

describe('verifyPostbackToken', () => {
  it('accepts a matching token', () => {
    expect(verifyPostbackToken('s3cret', 's3cret')).toBe(true);
  });

  it('rejects wrong, empty, or missing tokens', () => {
    expect(verifyPostbackToken('wrong', 's3cret')).toBe(false);
    expect(verifyPostbackToken('', 's3cret')).toBe(false);
    expect(verifyPostbackToken(undefined, 's3cret')).toBe(false);
    expect(verifyPostbackToken('s3cret', '')).toBe(false);
  });

  it('is safe against length-mismatched comparisons', () => {
    expect(verifyPostbackToken('s3cret-padded-longer', 's3cret')).toBe(false);
  });
});

describe('verifyPostbackSignature', () => {
  const secret = 'postback-secret';
  const body = JSON.stringify({ txid: 'abc', payout: '50.00' });
  const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid hex HMAC over the body', () => {
    expect(verifyPostbackSignature(body, hex, secret)).toBe(true);
    expect(verifyPostbackSignature(body, `sha256=${hex}`, secret)).toBe(true);
  });

  it('rejects a signature over a different body', () => {
    expect(verifyPostbackSignature(body + ' ', hex, secret)).toBe(false);
    expect(verifyPostbackSignature(body, undefined, secret)).toBe(false);
  });
});

describe('AffiliatesService.recordConversion', () => {
  const makeRepo = () => {
    const rows: any[] = [];
    return {
      rows,
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ ...v, id: 'uuid-1' })),
      findOne: jest.fn(async ({ where }: any) =>
        rows.find(
          (r) =>
            r.network === where.network &&
            r.transactionId === where.transactionId,
        ) ?? null,
      ),
    };
  };

  it('normalizes common postback field aliases', async () => {
    const repo = makeRepo();
    const svc = new AffiliatesService(repo as any);
    const res = await svc.recordConversion('curadebt', {
      txid: 'CD-1001',
      aff_sub: 'click-42',
      payout: '50.00',
      status: 'confirmed',
    });
    expect(res.duplicate).toBe(false);
    const c = res.conversion as any;
    expect(c.network).toBe('curadebt');
    expect(c.transactionId).toBe('CD-1001');
    expect(c.clickId).toBe('click-42');
    expect(c.payoutCents).toBe(5000);
    expect(c.status).toBe('approved');
    expect(c.rawPayload.txid).toBe('CD-1001');
  });

  it('dedupes on (network, transaction_id)', async () => {
    const repo = makeRepo();
    const svc = new AffiliatesService(repo as any);
    const first = await svc.recordConversion('awin', { txid: 'T1' });
    repo.rows.push(first.conversion);
    const second = await svc.recordConversion('awin', { txid: 'T1' });
    expect(second.duplicate).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('treats *_cents params as minor units and leaves payout unset when absent', async () => {
    const repo = makeRepo();
    const svc = new AffiliatesService(repo as any);
    const a = await svc.recordConversion('x', {
      txid: 'A',
      payout_cents: '4500',
    });
    expect((a.conversion as any).payoutCents).toBe(4500);
    const b = await svc.recordConversion('x', { txid: 'B' });
    expect((b.conversion as any).payoutCents).toBeUndefined();
  });
});
