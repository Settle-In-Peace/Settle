import { ConfigService } from '@nestjs/config';
import { VendorLeadScoringService } from './vendor-lead-scoring.service';

function makeScorer(env: Record<string, string> = {}) {
  const config = {
    get: (key: string, def?: any) => env[key] ?? def,
  } as ConfigService;
  return new VendorLeadScoringService(config);
}

describe('VendorLeadScoringService', () => {
  it('scores a fully-consented, high-debt, licensed lead as premium', () => {
    const scorer = makeScorer();
    const result = scorer.score({
      phone: '+15551234567',
      email: 'a@b.com',
      state: 'TX',
      totalDebt: 60000,
      tcpaConsent: true,
    });
    // 30 consent + 20 phone + 10 email + 15 licensed + 25 debt = 100
    expect(result.score).toBe(100);
    expect(result.tier).toBe('premium');
    expect(result.factors.consented).toBe(true);
    expect(result.factors.licensedState).toBe(true);
  });

  it('caps unconsented leads at 20 regardless of other signals', () => {
    const scorer = makeScorer();
    const result = scorer.score({
      phone: '+15551234567',
      email: 'a@b.com',
      state: 'TX',
      totalDebt: 90000,
      tcpaConsent: false,
    });
    expect(result.score).toBe(20);
    expect(result.tier).toBe('low');
    expect(result.factors.capped).toContain('no consent');
  });

  it('treats undefined consent as unconsented', () => {
    const result = makeScorer().score({ phone: '+15551234567', state: 'TX' });
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it('honours LEAD_SCORING_LICENSED_STATES overrides', () => {
    const scorer = makeScorer({ LEAD_SCORING_LICENSED_STATES: 'TX,FL' });
    const tx = scorer.score({ state: 'TX', tcpaConsent: true });
    const ca = scorer.score({ state: 'CA', tcpaConsent: true });
    expect(tx.factors.licensedState).toBe(true);
    expect(ca.factors.licensedState).toBe(false);
    expect(tx.score).toBeGreaterThan(ca.score);
  });

  it('is transparent — every factor is recorded', () => {
    const result = makeScorer().score({
      phone: '+15551234567',
      state: 'NY',
      totalDebt: 12000,
      tcpaConsent: true,
    });
    expect(result.factors).toMatchObject({
      consented: true,
      phonePresent: 20,
      licensedState: true,
      debtAmount: 12000,
      debtPoints: 12,
    });
  });
});
