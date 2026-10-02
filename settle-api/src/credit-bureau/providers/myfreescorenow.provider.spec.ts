import { ConfigService } from '@nestjs/config';
import {
  MfsnNotConfiguredError,
  MfsnUpstreamError,
  MyFreeScoreNowProvider,
} from './myfreescorenow.provider';
import {
  CreditPullType,
  CreditReportProduct,
  CreditPullRequest,
} from '../credit-provider.interface';

const SAMPLE_REQUEST: CreditPullRequest = {
  firstName: 'Jane',
  lastName: 'Doe',
  pullType: CreditPullType.SOFT,
  product: CreditReportProduct.CREDIT_SNAPSHOT,
  permissiblePurpose: 'account_review',
  consent: { grantedAt: new Date('2026-01-01T00:00:00Z'), method: 'web_form' },
};

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    MFSN_API_BASE_URL: 'https://uat-api.myfreescorenow.com',
    MFSN_API_USER: 'sandbox-user',
    MFSN_API_PASSWORD: 'sandbox-pass',
    MFSN_TIMEOUT_MS: 5000,
    MFSN_MAX_RETRIES: 1,
    ...overrides,
  };
  return { get: (key: string, def?: unknown) => values[key] ?? def } as any;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MyFreeScoreNowProvider', () => {
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

  it('reports unconfigured when credentials are missing', () => {
    const provider = new MyFreeScoreNowProvider(
      makeConfig({ MFSN_API_USER: undefined, MFSN_API_EMAIL: undefined }),
    );
    expect(provider.isConfigured()).toBe(false);
  });

  it('throws MfsnNotConfiguredError instead of calling fetch', async () => {
    const provider = new MyFreeScoreNowProvider(
      makeConfig({ MFSN_API_USER: '', MFSN_API_EMAIL: '', MFSN_API_PASSWORD: '' }),
    );
    await expect(provider.authenticate()).rejects.toBeInstanceOf(
      MfsnNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts MFSN_API_EMAIL as fallback for the API user', () => {
    const provider = new MyFreeScoreNowProvider(
      makeConfig({ MFSN_API_USER: '', MFSN_API_EMAIL: 'legacy-user' }),
    );
    expect(provider.isConfigured()).toBe(true);
  });

  it('authenticates and caches the token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, message: 'ok', token: 'tok-1' }),
    );
    const provider = new MyFreeScoreNowProvider(makeConfig());

    const t1 = await provider.authenticate();
    const t2 = await provider.authenticate();

    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // credentials go in the request body — never the URL
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://uat-api.myfreescorenow.com/api/auth/login');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'sandbox-user',
      password: 'sandbox-pass',
    });
  });

  it('fails closed on 4xx — no retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'bad request' }, 422));
    const provider = new MyFreeScoreNowProvider(makeConfig());

    await expect(provider.authenticate()).rejects.toMatchObject({
      name: 'MfsnUpstreamError',
      status: 422,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry on 4xx
  });

  it('retries on 5xx then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 502))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, message: 'ok', token: 'tok-2' }),
      );
    const provider = new MyFreeScoreNowProvider(makeConfig());

    await expect(provider.authenticate()).resolves.toBe('tok-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pulls credit with a bearer token and normalizes the response', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ success: true, message: 'ok', token: 'tok-3' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          requestId: 'req-1',
          bureaus: [{ bureau: 'Experian', score: 712, scoreModel: 'VantageScore 3.0' }],
          tradelines: [{ creditorName: 'ACME Card', balance: 1200 }],
          inquiries: [],
          publicRecords: [],
          warnings: [],
        }),
      );

    const provider = new MyFreeScoreNowProvider(makeConfig());
    const result = await provider.pullCredit(SAMPLE_REQUEST);

    expect(result.providerRequestId).toBe('req-1');
    expect(result.scores[0]).toMatchObject({ bureau: 'experian', score: 712 });
    expect(result.tradelines[0].creditorName).toBe('ACME Card');

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://uat-api.myfreescorenow.com/api/admin/1breport-v2');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-3',
    );
    const payload = JSON.parse(init.body as string);
    expect(payload.pullType).toBe('soft');
    expect(payload.consent.method).toBe('web_form');
    expect(payload.ssn).toBeUndefined(); // absent PII is not sent
  });

  it('re-authenticates once when the cached token is rejected (401)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ success: true, message: 'ok', token: 'stale-tok' }),
      )
      .mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, message: 'ok', token: 'fresh-tok' }),
      )
      .mockResolvedValueOnce(jsonResponse({ requestId: 'req-2', bureaus: [] }));

    const provider = new MyFreeScoreNowProvider(makeConfig());
    const result = await provider.pullCredit(SAMPLE_REQUEST);

    expect(result.providerRequestId).toBe('req-2');
    const [, retryInit] = fetchMock.mock.calls[3];
    expect(
      (retryInit.headers as Record<string, string>).Authorization,
    ).toBe('Bearer fresh-tok');
  });
});
