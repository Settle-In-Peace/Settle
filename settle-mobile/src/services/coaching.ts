import { api } from './api';

// SI Coach + coaching-subscription client — mirrors settle-api /coaching/*
// and /stripe/coaching/checkout. The subscription status endpoint is the
// source of truth for the paywall (it is entitlement-aware server-side:
// staff/test bypass accounts come back `active: true`, so the UI never
// special-cases reviewer emails).

export interface CoachingSubscriptionStatus {
  /** Stripe subscription status: active | trialing | past_due | canceled | inactive */
  status: string;
  /** Entitlement-aware flag — true for subscribers AND bypassed accounts. */
  active: boolean;
  stripeSubscriptionId: string | null;
  startedAt: string | null;
  canceledAt: string | null;
}

export interface CoachChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function isCoachingEntitled(sub: CoachingSubscriptionStatus | null | undefined): boolean {
  if (!sub) return false;
  return sub.active || sub.status === 'active' || sub.status === 'trialing';
}

export async function getCoachingSubscription(): Promise<CoachingSubscriptionStatus> {
  const res = await api.get('/coaching/subscription');
  return res.data;
}

/** Any signed-in user may probe this — unconfigured means degrade, not error. */
export async function getCoachStatus(): Promise<{ configured: boolean }> {
  const res = await api.get('/coaching/chat/status');
  return res.data;
}

export async function sendCoachMessage(
  messages: CoachChatMessage[],
): Promise<{ reply: string; model?: string }> {
  // LLM completions can run past the shared 15s axios timeout under load —
  // give a chat turn a full minute before treating it as unreachable.
  const res = await api.post('/coaching/chat', { messages }, { timeout: 60000 });
  return res.data;
}

// Stripe Checkout is web-hosted — returnUrl must point at the web app so
// success/cancel land on its /portal/billing/* pages. The session URL opens
// in the system browser; the webhook flips the subscription server-side and
// the next /coaching/subscription poll (on screen focus) reflects it.
export const COACHING_WEB_ORIGIN = 'https://settleinpeace.com';

export async function createCoachingCheckout(
  tier: 'basic' | 'pro',
): Promise<{ url: string; sessionId: string }> {
  const res = await api.post('/stripe/coaching/checkout', {
    returnUrl: COACHING_WEB_ORIGIN,
    tier,
  });
  return res.data;
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
  const res = await api.post('/stripe/billing-portal');
  return res.data;
}
