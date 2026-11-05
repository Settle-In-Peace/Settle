/**
 * Shared close-flow types + config resolution. Copy-verbatim across sites
 * (see docs/SI_CLOSE_FLOW.md). Env-driven so each site reuses the same file.
 */

export type SequenceStatus =
  | 'active' // in the nurture sequence (or awaiting payment)
  | 'paid' // checkout completed — terminal
  | 'expired' // sequence finished unpaid — terminal
  | 'closed_bad_fit' // scored bad-fit, polite close sent — terminal
  | 'unsubscribed'; // opted out — terminal

export interface NurtureRow {
  id: string;
  site: string;
  leadRef?: string | null; // per-site lead id (leads.id / loads.id / ...)
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  vertical?: string | null;
  offer?: string | null; // what we're selling ('load_listing', 'match_fee', ...)
  status: SequenceStatus;
  stepIndex: number;
  nextSendAt?: Date | null;
  checkoutUrl?: string | null;
  stripeSessionId?: string | null;
  score?: number | null;
  grade?: string | null;
  reasons?: string[];
  paidAt?: Date | null;
  amountCents?: number | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NurtureStep {
  /** Minutes after sequence start when this step fires. */
  afterMinutes: number;
  channel: 'sms' | 'email' | 'both';
  /** Template key — see close-flow.templates.ts */
  template: 'confirm' | 'value' | 'last_chance';
}

/** Default sequence: day-0 confirm, day-1 value email, day-3 last chance. */
export const DEFAULT_NURTURE_STEPS: NurtureStep[] = [
  { afterMinutes: 0, channel: 'both', template: 'confirm' },
  { afterMinutes: 24 * 60, channel: 'email', template: 'value' },
  { afterMinutes: 3 * 24 * 60, channel: 'both', template: 'last_chance' },
];

export interface CloseFlowOffer {
  /** Stripe Price id (price_...) — takes precedence over priceCents. */
  priceId?: string;
  /** Inline ad-hoc amount when no prebuilt Price exists. */
  priceCents?: number;
  productName: string;
  /** Key recorded on the row + Stripe metadata (e.g. 'load_listing'). */
  offerKey: string;
}

export interface CloseFlowSiteConfig {
  /** Site slug stored on rows ('notyced' | 'prime' | 'settle' | ...). */
  site: string;
  /** Brand for messages. */
  brand: string;
  /** Absolute URL the customer lands on after paying. */
  successUrl: string;
  cancelUrl: string;
  /** Default offer used when no per-vertical offer matches. */
  offer?: CloseFlowOffer;
  /** Per-vertical offers: vertical (lowercase) → offer. */
  offers?: Record<string, CloseFlowOffer>;
  nurtureSteps?: NurtureStep[];
  serviceZipPrefixes?: string[];
  serviceAreaLabel?: string;
  minBudgetCents?: number;
  /**
   * Hard-paywall funnels (pay-to-list): create the checkout for 'nurture'
   * leads too — the score then only steers messaging, not whether a link
   * exists. 'bad_fit' still never gets a link.
   */
  alwaysCheckout?: boolean;
}

/** Injection token: this api's site config (used by the controller). */
export const CLOSE_FLOW_SITE = 'CLOSE_FLOW_SITE';

export interface CloseLeadInput {
  leadRef?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  zip?: string;
  vertical?: string;
  budgetCents?: number | null;
  budgetText?: string;
  message?: string;
  details?: Record<string, unknown> | null;
  waitlist?: boolean;
}

/**
 * Env fallbacks so a site can configure the default offer without code:
 *   CLOSE_FLOW_PRICE_ID            – Stripe price id for the default offer
 *   CLOSE_FLOW_PRICE_CENTS         – ad-hoc amount when no price id exists
 *   CLOSE_FLOW_PRODUCT             – product name for ad-hoc price_data
 *   CLOSE_FLOW_PRICE_<VERTICAL>    – per-vertical Stripe price id
 *   CLOSE_FLOW_SUCCESS_URL / _CANCEL_URL
 */
export function resolveOffer(
  vertical: string | undefined,
  cfg: CloseFlowSiteConfig,
): CloseFlowOffer | undefined {
  const v = (vertical || '').toLowerCase();
  const envPrice = v && process.env[`CLOSE_FLOW_PRICE_${v.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
  if (envPrice) {
    return {
      priceId: envPrice,
      productName: cfg.offers?.[v]?.productName ?? cfg.offer?.productName ?? `${cfg.brand} — priority`,
      offerKey: cfg.offers?.[v]?.offerKey ?? v ?? 'intake',
    };
  }
  if (cfg.offers?.[v]) return cfg.offers[v];
  if (cfg.offer) return cfg.offer;
  const priceId = process.env.CLOSE_FLOW_PRICE_ID;
  const priceCents = Number(process.env.CLOSE_FLOW_PRICE_CENTS) || undefined;
  if (!priceId && !priceCents) return undefined;
  return {
    priceId,
    priceCents,
    productName: process.env.CLOSE_FLOW_PRODUCT || `${cfg.brand} — priority`,
    offerKey: 'intake',
  };
}
