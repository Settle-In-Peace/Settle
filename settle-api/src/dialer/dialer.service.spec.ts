import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DialerService } from './dialer.service';
import {
  DialerCallStatus,
  DialerProvider,
  PlaceCallResult,
} from './dialer-provider.interface';
import { PlaceCallDto } from './dto/place-call.dto';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    DIALER_PROVIDER: 'telnyx',
    ...overrides,
  };
  return { get: (key: string, def?: unknown) => values[key] ?? def } as any;
}

function makeProvider(configured = true): DialerProvider & {
  placeCall: jest.Mock<Promise<PlaceCallResult>>;
} {
  return {
    name: 'telnyx',
    isConfigured: () => configured,
    placeCall: jest.fn(async () => ({
      providerCallId: 'ccid-1',
      status: DialerCallStatus.DIALING,
      rawResponse: { data: {} },
    })),
    hangup: jest.fn(async () => undefined),
    callStatus: jest.fn(async () => ({ status: DialerCallStatus.DIALING })),
    recordingUrl: jest.fn(async () => null),
    ingestWebhook: jest.fn(() => null),
  };
}

function makeRepos(overrides: Record<string, any> = {}) {
  const savedCalls: any[] = [];
  const dialerCallsRepository = {
    create: (data: any) => ({ ...data }),
    save: jest.fn(async (call: any) => {
      const row = { id: call.id ?? `call-${savedCalls.length + 1}`, ...call };
      savedCalls.push(row);
      return row;
    }),
    find: jest.fn(async () => savedCalls),
    findOne: jest.fn(async ({ where }: any) =>
      savedCalls.find((c) =>
        Object.entries(where).every(([k, v]) => c[k] === v),
      ) ?? null,
    ),
  };
  const dncRepository = {
    findOne: jest.fn(async () => null),
    ...overrides.dncRepository,
  };
  const consentRepository = {
    find: jest.fn(async () => []),
    ...overrides.consentRepository,
  };
  const debtorProfilesRepository = {
    findOne: jest.fn(async () => null),
    ...overrides.debtorProfilesRepository,
  };
  return {
    dialerCallsRepository,
    dncRepository,
    consentRepository,
    debtorProfilesRepository,
    savedCalls,
  };
}

function makeService(opts: {
  configured?: boolean;
  config?: Record<string, unknown>;
  repos?: Record<string, any>;
} = {}) {
  const provider = makeProvider(opts.configured ?? true);
  const vicidial = { ...makeProvider(), name: 'vicidial' };
  const repos = makeRepos(opts.repos ?? {});
  const service = new DialerService(
    makeConfig(opts.config),
    provider as any,
    vicidial as any,
    repos.dialerCallsRepository as any,
    repos.dncRepository as any,
    repos.consentRepository as any,
    repos.debtorProfilesRepository as any,
  );
  return { service, provider, repos };
}

const BASE_DTO: PlaceCallDto = {
  to: '+15551234567',
  manualDial: true,
  consentConfirmed: false,
};

describe('DialerService', () => {
  describe('phone normalization', () => {
    it('normalizes 10-digit US numbers to E.164', () => {
      const { service } = makeService();
      expect(service.normalizeE164('(415) 555-1234')).toBe('+14155551234');
      expect(service.normalizeE164('4155551234')).toBe('+14155551234');
      expect(service.normalizeE164('1-415-555-1234')).toBe('+14155551234');
      expect(service.normalizeE164('+14155551234')).toBe('+14155551234');
    });

    it('rejects numbers that cannot normalize to E.164', async () => {
      const { service, provider } = makeService();
      await expect(
        service.placeCall({ ...BASE_DTO, to: '123' }, 'agent-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.placeCall).not.toHaveBeenCalled();
    });
  });

  describe('TCPA guardrails', () => {
    it('blocks numbers on the DNC list', async () => {
      const { service, provider } = makeService({
        repos: {
          dncRepository: {
            findOne: jest.fn(async () => ({ source: 'federal_dnc' })),
          },
        },
      });
      await expect(
        service.placeCall(BASE_DTO, 'agent-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(provider.placeCall).not.toHaveBeenCalled();
    });

    it('blocks contacts flagged do-not-call on their debtor profile', async () => {
      const { service, provider } = makeService({
        repos: {
          debtorProfilesRepository: {
            findOne: jest.fn(async () => ({ doNotCall: true })),
          },
        },
      });
      await expect(
        service.placeCall({ ...BASE_DTO, contactId: 'c-1' }, 'agent-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(provider.placeCall).not.toHaveBeenCalled();
    });

    it('requires consent for autodial (manualDial=false)', async () => {
      const { service, provider } = makeService();
      await expect(
        service.placeCall(
          { ...BASE_DTO, manualDial: false, consentConfirmed: false },
          'agent-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(provider.placeCall).not.toHaveBeenCalled();
    });

    it('allows autodial when consent is confirmed', async () => {
      const { service, provider } = makeService();
      const call = await service.placeCall(
        { ...BASE_DTO, manualDial: false, consentConfirmed: true },
        'agent-1',
      );
      expect(provider.placeCall).toHaveBeenCalledTimes(1);
      expect(call.manualDial).toBe(false);
      expect(call.consentConfirmed).toBe(true);
    });

    it('allows autodial when a stored TCPA consent record exists', async () => {
      const { service } = makeService({
        repos: {
          consentRepository: {
            find: jest.fn(async () => [
              { consentTimestamp: new Date(), expiresAt: null },
            ]),
          },
        },
      });
      const call = await service.placeCall(
        { ...BASE_DTO, manualDial: false },
        'agent-1',
      );
      expect(call.consentConfirmed).toBe(true);
      expect(call.consentMethod).toBe('stored');
    });
  });

  describe('provider gating', () => {
    it('returns 503 when the provider is not configured', async () => {
      const { service, provider } = makeService({ configured: false });
      await expect(
        service.placeCall(BASE_DTO, 'agent-1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(provider.placeCall).not.toHaveBeenCalled();
    });

    it('persists providerCallId and marks the call dialing on success', async () => {
      const { service } = makeService();
      const call = await service.placeCall(
        { ...BASE_DTO, to: '415-555-1234', consentConfirmed: true },
        'agent-1',
      );
      expect(call.providerCallId).toBe('ccid-1');
      expect(call.status).toBe(DialerCallStatus.DIALING);
      expect(call.phoneNumber).toBe('+14155551234');
      expect(call.provider).toBe('telnyx');
      expect(call.agentId).toBe('agent-1');
    });
  });

  describe('status', () => {
    it('reports which providers are configured', () => {
      const { service } = makeService();
      const status = service.getStatus();
      expect(status.activeProvider).toBe('telnyx');
      expect(status.providers.find((p) => p.name === 'telnyx')?.configured).toBe(
        true,
      );
      expect(
        status.providers.find((p) => p.name === 'vicidial')?.configured,
      ).toBe(true); // makeProvider() stub is "configured"
    });
  });
});
