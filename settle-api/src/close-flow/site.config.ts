import type { CloseFlowSiteConfig } from './close-flow.types';

/**
 * Settle's close-flow config. The assessment funnel is a hard paywall on the
 * contact step (`alwaysCheckout`): any submitted assessment gets a match-fee
 * checkout — score steers messaging. Debt relief is nationwide → no geo gate.
 *
 * Offer: STRIPE_PRICE_MATCH_FEE (prebuilt price) wins, else ad-hoc
 * SETTLE_MATCH_FEE_CENTS (default $19 — the family-pays intake fee).
 * SETTLE_MATCH_FEE_CENTS=0 disables the fee (graceful free mode).
 */
const matchFeeCents = () => {
  const v = process.env.SETTLE_MATCH_FEE_CENTS;
  return v != null && v !== '' ? Number(v) : 1900;
};

export const SETTLE_SITE: CloseFlowSiteConfig = {
  site: 'settle',
  brand: 'Settle in Peace',
  successUrl:
    process.env.CLOSE_FLOW_SUCCESS_URL ||
    'https://settleinpeace.com/compare?paid=1',
  cancelUrl:
    process.env.CLOSE_FLOW_CANCEL_URL || 'https://settleinpeace.com/compare',
  alwaysCheckout: true,
  offer: {
    priceId: process.env.STRIPE_PRICE_MATCH_FEE || undefined,
    priceCents: process.env.STRIPE_PRICE_MATCH_FEE ? undefined : matchFeeCents(),
    productName: 'Priority provider match — Settle in Peace',
    offerKey: 'match_fee',
  },
};
