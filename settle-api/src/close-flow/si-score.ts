/**
 * SI lead scoring — deterministic, rule-based, no LLM. Shared across sites
 * (copy-verbatim; see docs/SI_CLOSE_FLOW.md).
 *
 * Score bands:
 *   >= readyThreshold  → ready_to_pay  (send a checkout link immediately)
 *   >= badFitThreshold → nurture       (queued day-0/1/3 sequence)
 *   <  badFitThreshold → bad_fit       (polite close, no sequence)
 */

export type CloseAction = 'ready_to_pay' | 'nurture' | 'bad_fit';

export interface ScoreInput {
  email?: string;
  phone?: string;
  name?: string;
  /** ZIP (or postal code) the lead gave. */
  zip?: string;
  /** Budget in cents when structured; free text otherwise. */
  budgetCents?: number | null;
  budgetText?: string;
  vertical?: string;
  /** Free-text intent (message/description/notes). */
  message?: string;
  /** Structured extras (project types, timeline, etc.). */
  details?: Record<string, unknown> | null;
  /** Explicit out-of-area/waitlist flag from the intake form. */
  waitlist?: boolean;
}

export interface ScoreConfig {
  /** Allowed ZIP3 prefixes (e.g. ['900','901','902'...]). Undefined = anywhere. */
  serviceZipPrefixes?: string[];
  /** Label used in reasons/messaging, e.g. 'SoCal'. */
  serviceAreaLabel?: string;
  /** Minimum budget (cents) that counts as in-band. Undefined = any budget ok. */
  minBudgetCents?: number;
  readyThreshold?: number; // default 70
  badFitThreshold?: number; // default 35
}

export interface ScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  action: CloseAction;
  reasons: string[];
  inServiceArea: boolean | null;
}

/** Parse "$5,000" / "5000" / "5k" → cents. Returns null when unparseable. */
export function parseBudgetCents(text?: string | null): number | null {
  if (!text) return null;
  const m = String(text).replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k') n *= 1_000;
  if (unit === 'm') n *= 1_000_000;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function zipInArea(zip: string | undefined, prefixes: string[] | undefined): boolean | null {
  if (!prefixes || prefixes.length === 0) return null; // no geo gate
  const z = (zip || '').trim();
  if (!/^\d{5}/.test(z)) return false;
  return prefixes.some((p) => z.startsWith(p));
}

export function scoreLead(input: ScoreInput, cfg: ScoreConfig = {}): ScoreResult {
  const readyAt = cfg.readyThreshold ?? 70;
  const badAt = cfg.badFitThreshold ?? 35;
  const reasons: string[] = [];
  let score = 0;

  // ── Contact completeness (≤30) ──────────────────────────────────────
  if (input.email && /^\S+@\S+\.\S+$/.test(input.email)) {
    score += 10;
    reasons.push('email');
  }
  if (input.phone && input.phone.replace(/\D/g, '').length >= 10) {
    score += 10;
    reasons.push('phone');
  }
  if (input.name && input.name.trim().length >= 2) {
    score += 10;
    reasons.push('name');
  }

  // ── Service area (≤25) ──────────────────────────────────────────────
  const inArea = zipInArea(input.zip, cfg.serviceZipPrefixes);
  if (inArea === true) {
    score += 25;
    reasons.push('in_service_area');
  } else if (inArea === false) {
    reasons.push('outside_service_area');
  } else {
    score += 10; // no geo gate configured
    reasons.push('no_geo_gate');
  }

  // ── Budget band (≤25) ───────────────────────────────────────────────
  const budget =
    input.budgetCents != null && input.budgetCents > 0
      ? input.budgetCents
      : parseBudgetCents(input.budgetText);
  if (budget != null && cfg.minBudgetCents != null) {
    if (budget >= cfg.minBudgetCents) {
      score += 25;
      reasons.push('budget_in_band');
    } else {
      score += 8;
      reasons.push('budget_below_band');
    }
  } else if (budget != null) {
    score += 20;
    reasons.push('budget_stated');
  } else if (input.budgetText) {
    score += 12;
    reasons.push('budget_text');
  } else {
    score += 8;
    reasons.push('budget_unknown');
  }

  // ── Intent richness (≤20) ───────────────────────────────────────────
  const details = input.details ?? {};
  const intentBits = [
    input.message,
    details.description,
    details.timeline,
    details.urgency,
    Array.isArray(details.projectTypes) && details.projectTypes.length ? 'types' : '',
    Array.isArray(details.debtTypes) && details.debtTypes.length ? 'types' : '',
    details.propertyType,
  ].filter((v) => typeof v === 'string' && v.trim().length > 0 || v === 'types');
  const richness = Math.min(intentBits.length, 4);
  score += richness * 5;
  if (richness >= 2) reasons.push('rich_intent');
  else if (richness === 1) reasons.push('some_intent');

  score = Math.min(score, 100);

  // ── Action ──────────────────────────────────────────────────────────
  let action: CloseAction;
  if (input.waitlist || inArea === false) {
    action = 'bad_fit'; // polite close / waitlist — never chase for payment
    reasons.push('forced_close');
  } else if (score >= readyAt) {
    action = 'ready_to_pay';
  } else if (score >= badAt) {
    action = 'nurture';
  } else {
    action = 'bad_fit';
  }

  const grade: ScoreResult['grade'] =
    score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';

  return { score, grade, action, reasons, inServiceArea: inArea };
}
