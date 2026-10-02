import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  TelnyxDialerProvider,
  TelnyxNotConfiguredError,
  TelnyxUpstreamError,
} from './telnyx-dialer.provider';
import { DialerCallStatus, PlaceCallRequest } from '../dialer-provider.interface';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    TELNYX_API_KEY: 'test-key',
    TELNYX_FROM_NUMBER: '+15550001111',
    TELNYX_CONNECTION_ID: 'conn-123',
    TELNYX_API_BASE_URL: 'https://api.telnyx.com/v2',
    TELNYX_TIMEOUT_MS: 5000,
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

const SAMPLE_REQUEST: PlaceCallRequest = {
  to: '+15551234567',
  consentConfirmed: true,
  manualDial: true,
  contactId: 'contact-1',
  clientState: { dialerCallId: 'call-uuid-1' },
};

describe('TelnyxDialerProvider', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.TELNYX_PUBLIC_KEY;
  });

  it('reports unconfigured when credentials are missing', () => {
    const provider = new TelnyxDialerProvider(
      makeConfig({ TELNYX_API_KEY: '', TELNYX_CONNECTION_ID: '' }),
    );
    expect(provider.isConfigured()).toBe(false);
  });

  it('fails closed — placeCall throws instead of calling fetch', async () => {
    const provider = new TelnyxDialerProvider(
      makeConfig({ TELNYX_API_KEY: '', TELNYX_CONNECTION_ID: '' }),
    );
    await expect(provider.placeCall(SAMPLE_REQUEST)).rejects.toBeInstanceOf(
      TelnyxNotConfiguredError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('originates a call with connection_id, E.164 to/from and TCPA client_state', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { call_control_id: 'ccid-1', call_leg_id: 'leg-1' } }),
    );
    const provider = new TelnyxDialerProvider(makeConfig());
    const result = await provider.placeCall(SAMPLE_REQUEST);

    expect(result.providerCallId).toBe('ccid-1');
    expect(result.status).toBe(DialerCallStatus.DIALING);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telnyx.com/v2/calls');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key',
    );
    const body = JSON.parse(init.body as string);
    expect(body.connection_id).toBe('conn-123');
    expect(body.to).toBe('+15551234567');
    expect(body.from).toBe('+15550001111');

    // client_state echoes our dialer_call id + TCPA flags back on webhooks
    const clientState = JSON.parse(
      Buffer.from(body.client_state, 'base64').toString('utf8'),
    );
    expect(clientState).toMatchObject({
      dialerCallId: 'call-uuid-1',
      manualDial: true,
      consentConfirmed: true,
    });
  });

  it('fails closed on 4xx — no retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: [{ detail: 'bad' }] }, 422));
    const provider = new TelnyxDialerProvider(makeConfig());
    await expect(provider.placeCall(SAMPLE_REQUEST)).rejects.toMatchObject({
      name: 'TelnyxUpstreamError',
      status: 422,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('issues a hangup command', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));
    const provider = new TelnyxDialerProvider(makeConfig());
    await provider.hangup('ccid-9');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telnyx.com/v2/calls/ccid-9/actions/hangup');
  });

  it('normalizes call.answered / hangup / recording webhook events', () => {
    const provider = new TelnyxDialerProvider(makeConfig());
    const clientState = Buffer.from(
      JSON.stringify({ dialerCallId: 'call-uuid-1' }),
    ).toString('base64');

    const answered = provider.ingestWebhook({
      data: {
        event_type: 'call.answered',
        occurred_at: '2026-01-01T00:00:10Z',
        payload: { call_control_id: 'ccid-1', client_state: clientState },
      },
    });
    expect(answered).toMatchObject({
      kind: 'answered',
      status: DialerCallStatus.ANSWERED,
      providerCallId: 'ccid-1',
      clientState: { dialerCallId: 'call-uuid-1' },
    });

    const hangup = provider.ingestWebhook({
      data: {
        event_type: 'call.hangup',
        payload: {
          call_control_id: 'ccid-1',
          hangup_cause: 'busy',
          call_duration_secs: 0,
        },
      },
    });
    expect(hangup?.status).toBe(DialerCallStatus.BUSY);

    const recording = provider.ingestWebhook({
      data: {
        event_type: 'call.recording_saved',
        payload: {
          call_control_id: 'ccid-1',
          recording_urls: { mp3: 'https://cdn.example.com/rec.mp3' },
        },
      },
    });
    expect(recording).toMatchObject({
      kind: 'recording_saved',
      recordingUrl: 'https://cdn.example.com/rec.mp3',
    });
  });

  it('returns null for malformed webhook bodies', () => {
    const provider = new TelnyxDialerProvider(makeConfig());
    expect(provider.ingestWebhook({})).toBeNull();
    expect(provider.ingestWebhook({ data: null })).toBeNull();
  });

  it('rejects webhooks missing signature headers', () => {
    const provider = new TelnyxDialerProvider(makeConfig());
    expect(provider.verifyWebhookSignature('{}', {})).toBe(false);
  });

  it('accepts a correctly signed Ed25519 webhook and rejects tampering', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    const rawKey = spkiDer.subarray(spkiDer.length - 32); // strip 12-byte SPKI prefix
    const provider = new TelnyxDialerProvider(
      makeConfig({ TELNYX_PUBLIC_KEY: rawKey.toString('base64') }),
    );

    const rawBody = JSON.stringify({ data: { event_type: 'call.answered' } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
      .sign(null, Buffer.from(`${timestamp}|${rawBody}`, 'utf8'), privateKey)
      .toString('base64');

    const headers = {
      'telnyx-signature-ed25519': signature,
      'telnyx-timestamp-ed25519': timestamp,
    };
    expect(provider.verifyWebhookSignature(rawBody, headers)).toBe(true);
    expect(provider.verifyWebhookSignature(rawBody + 'x', headers)).toBe(false);
  });
});
