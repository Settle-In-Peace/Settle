import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VendorLeadScoreInput {
  phone?: string;
  email?: string;
  state?: string;
  totalDebt?: number;
  tcpaConsent?: boolean;
}

export interface VendorLeadScore {
  /** 0-100. */
  score: number;
  tier: 'premium' | 'qualified' | 'standard' | 'low';
  /** Transparent breakdown — every factor contributes a labelled amount. */
  factors: Record<string, number | string | boolean>;
}

/**
 * Default licensed-state list for debt-settlement lead intake, overridable
 * via LEAD_SCORING_LICENSED_STATES (comma-separated USPS codes). Debt
 * settlement regulation varies by state — treat this as operational config.
 */
const DEFAULT_LICENSED_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI',
  'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN',
  'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
]);

/**
 * Transparent rule-based scoring for vendor leads — deliberately simple and
 * explainable (every point is accounted for in `factors`). Designed to be
 * replaced by the AI scorer in src/ai/lead-scoring.service once vendor-lead
 * training data exists; callers only consume score/tier/factors.
 */
@Injectable()
export class VendorLeadScoringService {
  private readonly licensedStates: Set<string>;

  constructor(private readonly config: ConfigService) {
    const envList = this.config.get<string>('LEAD_SCORING_LICENSED_STATES', '');
    this.licensedStates = envList.trim()
      ? new Set(envList.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
      : DEFAULT_LICENSED_STATES;
  }

  score(input: VendorLeadScoreInput): VendorLeadScore {
    const factors: Record<string, number | string | boolean> = {};
    let score = 0;

    // TCPA consent is the strongest signal for a purchased lead — an
    // unconsented lead can't legally be contacted, so it also caps the score.
    const consented = input.tcpaConsent === true;
    factors.consented = consented;
    if (consented) score += 30;

    if (input.phone) {
      score += 20;
      factors.phonePresent = 20;
    }
    if (input.email) {
      score += 10;
      factors.emailPresent = 10;
    }

    const state = input.state?.toUpperCase();
    const licensed = Boolean(state && this.licensedStates.has(state));
    factors.state = state ?? 'unknown';
    factors.licensedState = licensed;
    if (licensed) score += 15;

    const debt = Number(input.totalDebt) || 0;
    let debtPoints = 0;
    if (debt >= 50_000) debtPoints = 25;
    else if (debt >= 25_000) debtPoints = 18;
    else if (debt >= 10_000) debtPoints = 12;
    else if (debt >= 7_500) debtPoints = 8;
    factors.debtAmount = debt;
    if (debtPoints) factors.debtPoints = debtPoints;
    score += debtPoints;

    // An unconsented lead is legally uncallable — cap it so sorting puts it last.
    if (!consented) {
      score = Math.min(score, 20);
      factors.capped = 'no consent — capped at 20';
    }

    score = Math.min(Math.round(score), 100);
    const tier =
      score >= 80 ? 'premium' : score >= 60 ? 'qualified' : score >= 40 ? 'standard' : 'low';
    return { score, tier, factors };
  }
}
