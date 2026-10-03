import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CollectionAiService } from './collection-ai.service';
import { LlmClientService } from '../ai/llm-client.service';
import { CollectionAccountStatus } from '../entities/collection-account.entity';
import { BankruptcyStatus } from '../entities/debtor-profile.entity';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    AI_MODEL: 'gpt-4o-mini',
    AI_CACHE_TTL_MS: 60000,
    ...overrides,
  };
  return { get: (key: string, def?: unknown) => values[key] ?? def } as any;
}

function makeLlm(configured = true, chatJson?: jest.Mock): LlmClientService {
  return {
    isConfigured: () => configured,
    chatJson: chatJson || jest.fn(),
    chat: jest.fn(),
  } as any;
}

const ACCOUNT = {
  id: 'acct-1',
  accountNumber: 'ACCT-987654321',
  crmClientId: 'client-1',
  originalBalance: 5000,
  currentBalance: 6200,
  status: CollectionAccountStatus.ACTIVE,
  priority: 3,
  delinquencyDays: 60,
  lastPaymentDate: new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10),
  customFields: {},
};

function makeRepos(overrides: {
  account?: any;
  debtor?: any;
  client?: any;
  notes?: any[];
  calls?: any[];
}) {
  const notes = overrides.notes ?? [];
  return {
    accountsRepo: {
      findOne: jest
        .fn()
        .mockResolvedValue(
          'account' in overrides ? overrides.account : ACCOUNT,
        ),
    },
    notesRepo: {
      count: jest.fn().mockResolvedValue(notes.length),
      find: jest.fn().mockResolvedValue(notes),
    },
    callsRepo: { find: jest.fn().mockResolvedValue(overrides.calls ?? []) },
    debtorRepo: {
      findOne: jest.fn().mockResolvedValue(overrides.debtor ?? null),
    },
    clientsRepo: {
      findOne: jest.fn().mockResolvedValue(
        overrides.client ?? { id: 'client-1', firstName: 'Jamie' },
      ),
    },
  };
}

function makeService(opts: {
  configured?: boolean;
  chatJson?: jest.Mock;
  repos?: ReturnType<typeof makeRepos>;
}) {
  const repos = opts.repos || makeRepos({});
  const service = new CollectionAiService(
    makeLlm(opts.configured ?? true, opts.chatJson),
    makeConfig(),
    repos.accountsRepo as any,
    repos.notesRepo as any,
    repos.callsRepo as any,
    repos.debtorRepo as any,
    repos.clientsRepo as any,
  );
  return { service, repos };
}

describe('CollectionAiService', () => {
  describe('getStatus / gating', () => {
    it('reports configured:false without a key', () => {
      const { service } = makeService({ configured: false });
      const status = service.getStatus();
      expect(status.configured).toBe(false);
      expect(status.provider).toBe('openai-compatible');
    });

    it('503s every generative endpoint when unconfigured', async () => {
      const { service } = makeService({ configured: false });
      await expect(service.propensity('a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(
        service.draftOffer({ accountId: 'a', targetPercent: 60 }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(service.nextAction('a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(
        service.summarize({ accountId: 'a' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        service.complianceCheck({ text: 'hi' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('propensity', () => {
    it('404s for a missing account', async () => {
      const repos = makeRepos({ account: null });
      const { service } = makeService({ repos });
      await expect(service.propensity('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns LLM score when parseable', async () => {
      const chatJson = jest
        .fn()
        .mockResolvedValue({ score: 72, reasoning: 'recent payment + contact', keyFactors: ['recent payment'] });
      const { service } = makeService({ chatJson });
      const res = await service.propensity('acct-1');
      expect(res.score).toBe(72);
      expect(res.degraded).toBe(false);
      expect(res.reasoning).toContain('recent payment');
    });

    it('falls back to heuristic score when LLM returns junk', async () => {
      const chatJson = jest.fn().mockResolvedValue(null);
      const { service } = makeService({ chatJson });
      const res = await service.propensity('acct-1');
      expect(res.degraded).toBe(true);
      expect(res.score).toBeGreaterThanOrEqual(0);
      expect(res.score).toBeLessThanOrEqual(100);
      // 30-day-old payment + answered-able account should score above neutral-ish floor
      expect(res.heuristicScore).toBeGreaterThan(50);
    });

    it('caches identical requests', async () => {
      const chatJson = jest.fn().mockResolvedValue({ score: 60 });
      const { service, repos } = makeService({ chatJson });
      await service.propensity('acct-1');
      await service.propensity('acct-1');
      expect(repos.accountsRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('nextAction', () => {
    it('escalates on bankruptcy without calling the LLM', async () => {
      const chatJson = jest.fn();
      const repos = makeRepos({
        debtor: { bankruptcyStatus: BankruptcyStatus.CHAPTER_7 },
      });
      const { service } = makeService({ chatJson, repos });
      const res = await service.nextAction('acct-1');
      expect(res.action).toBe('escalate');
      expect(res.reason.toLowerCase()).toContain('bankruptcy');
      expect(chatJson).not.toHaveBeenCalled();
    });

    it('escalates on deceased debtor', async () => {
      const repos = makeRepos({
        debtor: {
          bankruptcyStatus: BankruptcyStatus.NONE,
          deceasedDate: '2026-01-01',
        },
      });
      const { service } = makeService({ repos });
      const res = await service.nextAction('acct-1');
      expect(res.action).toBe('escalate');
    });

    it('downgrades call/sms to letter when debtor is on DNC', async () => {
      const chatJson = jest
        .fn()
        .mockResolvedValue({ action: 'call', reason: 'recent contact' });
      const repos = makeRepos({
        debtor: { bankruptcyStatus: BankruptcyStatus.NONE, doNotCall: true },
      });
      const { service } = makeService({ chatJson, repos });
      const res = await service.nextAction('acct-1');
      expect(res.action).toBe('letter');
    });
  });

  describe('complianceCheck', () => {
    const chatJson = jest.fn().mockResolvedValue({ flags: [] });

    it('flags arrest threats as high severity', async () => {
      const { service } = makeService({ chatJson });
      const res = await service.complianceCheck({
        text: 'Pay now or we will have you arrested. This is an attempt to collect a debt by a debt collector.',
        channel: 'call_script',
      });
      expect(res.ok).toBe(false);
      const flag = res.flags.find((f) => f.rule === 'threat_of_arrest');
      expect(flag).toBeDefined();
      expect(flag!.severity).toBe('high');
    });

    it('flags missing mini-Miranda on consumer-facing text', async () => {
      const { service } = makeService({ chatJson });
      const res = await service.complianceCheck({
        text: 'Hi, calling about your account balance. Please call us back.',
        channel: 'call_script',
      });
      expect(
        res.flags.find((f) => f.rule === 'mini_miranda_missing'),
      ).toBeDefined();
    });

    it('passes a compliant script', async () => {
      const { service } = makeService({ chatJson });
      const res = await service.complianceCheck({
        text:
          'Hi, this is Jane calling from ABC Collections. ' +
          'This communication is from a debt collector and is an attempt to collect a debt. ' +
          'You may be able to settle for less than the balance — would you like to discuss options?',
        channel: 'call_script',
      });
      expect(res.flags.length).toBe(0);
      expect(res.ok).toBe(true);
    });

    it('flags credit-deletion promises', async () => {
      const { service } = makeService({ chatJson });
      const res = await service.complianceCheck({
        text: 'If you pay, we will delete this from your credit report.',
        channel: 'email',
      });
      expect(
        res.flags.find((f) => f.rule === 'credit_deletion_promise'),
      ).toBeDefined();
      expect(res.ok).toBe(false);
    });
  });

  describe('draftOffer', () => {
    it('returns an offer that always requires review', async () => {
      const chatJson = jest.fn().mockResolvedValue({
        letter:
          'Dear Jamie, we offer to settle for $3,720.00. ' +
          'This communication is from a debt collector and is an attempt to collect a debt.',
      });
      const { service } = makeService({ chatJson });
      const res = await service.draftOffer({
        accountId: 'acct-1',
        targetPercent: 60,
      });
      expect(res.requiresReview).toBe(true);
      expect(res.offerAmount).toBeCloseTo(3720);
      expect(res.letter).toContain('debt collector');
    });

    it('appends mini-Miranda when the model omits it', async () => {
      const chatJson = jest
        .fn()
        .mockResolvedValue({ letter: 'Dear Jamie, please pay $3,720.00.' });
      const { service } = makeService({ chatJson });
      const res = await service.draftOffer({
        accountId: 'acct-1',
        targetPercent: 60,
      });
      expect(res.letter).toMatch(/attempt to collect a debt/i);
      expect(
        res.complianceFlags.find((f) => f.includes('Mini-Miranda')),
      ).toBeDefined();
    });
  });

  describe('summarize', () => {
    it('404s when the account has no activity', async () => {
      const repos = makeRepos({ notes: [], calls: [] });
      const { service } = makeService({ repos });
      await expect(
        service.summarize({ accountId: 'acct-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('summarizes notes + calls', async () => {
      const chatJson = jest.fn().mockResolvedValue({
        summary: 'Debtor promised to pay Friday.',
        keyPoints: ['P2P $200'],
        promisedActions: ['Debtor to pay $200 on Friday'],
      });
      const repos = makeRepos({
        notes: [
          {
            noteType: 'call',
            content: 'Spoke with debtor, SSN 123-45-6789, promised payment',
            createdAt: new Date(),
          },
        ],
      });
      const { service } = makeService({ chatJson, repos });
      const res = await service.summarize({ accountId: 'acct-1' });
      expect(res.summary).toContain('promised');
      expect(res.sourceItemCount).toBe(1);
      // PII must never reach the model prompt
      const prompt = JSON.stringify(chatJson.mock.calls[0][0]);
      expect(prompt).not.toContain('123-45-6789');
      expect(prompt).toContain('SSN REDACTED');
    });
  });
});
