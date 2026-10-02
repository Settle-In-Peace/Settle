import {
  LeadVendorNotConfiguredError,
  LeadVendorUpstreamError,
} from './lead-vendor-provider.interface';
import { PingPostVendorProvider } from './ping-post.provider';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const BASE_CFG = {
  name: 'testvendor',
  pingUrl: 'https://vendor.example/api/ping',
  postUrl: 'https://vendor.example/api/post',
  apiKey: 'secret-key',
  authStyle: 'param' as const,
  format: 'form' as const,
  maxRetries: 1,
  timeoutMs: 5000,
};

describe('PingPostVendorProvider', () => {
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

  it('reports unconfigured when no endpoints are set', () => {
    const provider = new PingPostVendorProvider({ name: 'novendor' });
    expect(provider.isConfigured()).toBe(false);
    expect(provider.supportsPingPost).toBe(false);
    expect(provider.listProducts()).toEqual([]);
  });

  it('throws LeadVendorNotConfiguredError instead of calling fetch', async () => {
    const provider = new PingPostVendorProvider({ name: 'novendor' });
    await expect(provider.ping({ state: 'TX' })).rejects.toBeInstanceOf(
      LeadVendorNotConfiguredError,
    );
    await expect(provider.post({ state: 'TX' })).rejects.toBeInstanceOf(
      LeadVendorNotConfiguredError,
    );
    await expect(provider.purchaseLeads({}, 5)).rejects.toBeInstanceOf(
      LeadVendorNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pings with form-encoded criteria and normalizes bid + ping id', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'matched', ping_id: 'ping-123', price: '42.50' }),
    );
    const provider = new PingPostVendorProvider(BASE_CFG);

    const result = await provider.ping({
      state: 'TX',
      totalDebt: 30000,
      debtTypes: ['credit_card'],
    });

    expect(result).toMatchObject({
      accepted: true,
      pingId: 'ping-123',
      price: 42.5,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://vendor.example/api/ping');
    expect(init.method).toBe('POST');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('api_key')).toBe('secret-key');
    expect(body.get('type')).toBe('ping');
    expect(body.get('state')).toBe('TX');
    expect(body.get('totalDebt')).toBe('30000');
    expect(body.get('debtTypes')).toBe('credit_card');
  });

  it('posts the full lead echoing the ping id — accept + redirect', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: 'accepted',
        lead_id: 'L-9',
        redirect_url: 'https://vendor.example/thanks',
      }),
    );
    const provider = new PingPostVendorProvider(BASE_CFG);

    const result = await provider.post(
      { firstName: 'Jane', lastName: 'Doe', phone: '+15551234567', state: 'TX' },
      'ping-123',
    );

    expect(result).toMatchObject({
      accepted: true,
      postId: 'L-9',
      redirectUrl: 'https://vendor.example/thanks',
    });
    const body = new URLSearchParams(
      fetchMock.mock.calls[0][1].body as string,
    );
    expect(body.get('pingId')).toBe('ping-123');
    expect(body.get('firstName')).toBe('Jane');
  });

  it('reports vendor rejections with the reason', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'rejected', reason: 'duplicate lead' }),
    );
    const provider = new PingPostVendorProvider(BASE_CFG);

    const result = await provider.post({ firstName: 'J' });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('duplicate lead');
  });

  it('sends JSON when format=json and bearer when authStyle=bearer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'matched', price: 10 }));
    const provider = new PingPostVendorProvider({
      ...BASE_CFG,
      format: 'json',
      authStyle: 'bearer',
    });
    await provider.ping({ state: 'CA' });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers['Authorization']).toBe('Bearer secret-key');
    expect(init.headers['Content-Type']).toBe('application/json');
    const payload = JSON.parse(init.body as string);
    expect(payload.state).toBe('CA');
    // apiKey must NOT leak into the body for bearer auth
    expect(payload.api_key).toBeUndefined();
  });

  it('renames fields via fieldMap', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'matched' }));
    const provider = new PingPostVendorProvider({
      ...BASE_CFG,
      fieldMap: { phone: 'Primary_Phone', state: 'State' },
      format: 'json',
    });
    await provider.ping({ phone: '+15551234567', state: 'FL' });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.Primary_Phone).toBe('+15551234567');
    expect(payload.State).toBe('FL');
    expect(payload.phone).toBeUndefined();
  });

  it('fails closed on 4xx — no retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'bad ping' }, 422));
    const provider = new PingPostVendorProvider(BASE_CFG);
    await expect(provider.ping({ state: 'TX' })).rejects.toMatchObject({
      name: 'LeadVendorUpstreamError',
      status: 422,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 502))
      .mockResolvedValueOnce(jsonResponse({ status: 'matched', price: 5 }));
    const provider = new PingPostVendorProvider(BASE_CFG);
    await expect(provider.ping({ state: 'TX' })).resolves.toMatchObject({
      accepted: true,
      price: 5,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('purchaseLeads orders and normalizes inline leads + pricing', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: 'accepted',
        order_id: 'ord-7',
        price_per_lead: 25,
        leads: [
          { firstName: 'A', phone: '+15551112222' },
          { firstName: 'B', email: 'b@x.com' },
        ],
      }),
    );
    const provider = new PingPostVendorProvider({
      ...BASE_CFG,
      orderUrl: 'https://vendor.example/api/order',
    });
    const result = await provider.purchaseLeads({ states: ['TX'] }, 10);

    expect(result.purchaseId).toBe('ord-7');
    expect(result.quantityReceived).toBe(2);
    expect(result.pricePerLead).toBe(25);
    expect(result.totalCost).toBe(50);
    expect(result.leads).toHaveLength(2);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://vendor.example/api/order');
  });

  it('priceLead returns static price without a network call when no pingUrl', async () => {
    const provider = new PingPostVendorProvider({
      name: 'flatrate',
      postUrl: 'https://vendor.example/post',
      basePrice: 30,
    });
    const result = await provider.priceLead({ states: ['TX'] });
    expect(result).toEqual({ accepted: true, price: 30 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses form-encoded responses (boberdoo-style)', async () => {
    fetchMock.mockResolvedValue(
      new Response('status=matched&ping_id=p-9&price=12.75', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    const provider = new PingPostVendorProvider(BASE_CFG);
    const result = await provider.ping({ state: 'TX' });
    expect(result).toMatchObject({
      accepted: true,
      pingId: 'p-9',
      price: 12.75,
    });
  });
});
