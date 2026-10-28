import { getAuthenticatedApi } from './api';

// ── Orgs + seats (settle-api /orgs/*, /seats/*) — per-seat DaaS tenancy ────

const ORG_FLAG_KEY = 'settle_org_member';

/** Cache org membership locally so nav can surface DaaS links w/o an extra call. */
export function setOrgMemberFlag(isMember: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (isMember) localStorage.setItem(ORG_FLAG_KEY, '1');
    else localStorage.removeItem(ORG_FLAG_KEY);
  } catch {
    /* storage unavailable — nav simply won't show the links */
  }
}

export function hasOrgMemberFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ORG_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export interface SeatPlan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  /** -1 = unlimited */
  includedMinutes: number;
  overagePerMinCents: number;
  features: string[];
  active: boolean;
}

export interface Org {
  id: string;
  name: string;
  billingEmail?: string;
  ownerUserId?: string;
  planCode?: string;
  seatsPurchased: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  status: 'active' | 'suspended' | 'canceled';
  createdAt: string;
  updatedAt: string;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  orgRole: 'org_owner' | 'org_manager' | 'agent';
  status: 'active' | 'invited' | 'suspended';
  createdAt: string;
  user?: { id: string; email: string; firstName?: string; lastName?: string };
}

export interface Seat {
  id: string;
  orgId: string;
  userId: string;
  seatTier: 'starter' | 'pro' | 'enterprise';
  monthlyMinutesIncluded: number;
  status: 'active' | 'suspended' | 'released';
  assignedAt?: string;
  releasedAt?: string;
  createdAt: string;
  user?: { id: string; email: string; firstName?: string; lastName?: string };
}

export interface SeatUsageRow {
  id: string;
  seatId: string;
  orgId: string;
  period: string;
  minutesUsed: number;
  callsPlaced: number;
  rpcCount: number;
  overageMinutes: number;
  seatTier?: string;
  monthlyMinutesIncluded?: number;
  seatStatus?: string;
  user?: { id: string; email: string; firstName?: string; lastName?: string };
}

export interface MyOrgResponse {
  org: Org;
  plan: SeatPlan | null;
  myRole: 'org_owner' | 'org_manager' | 'agent';
  seatsPurchased: number;
  seatsUsed: number;
  seatsAvailable: number;
  memberCount: number;
  usage: SeatUsageRow[];
}

function api() {
  return getAuthenticatedApi();
}

export function getSeatPlans() {
  return api()<SeatPlan[]>('/orgs/plans', { method: 'GET' });
}

export function createOrg(name: string, billingEmail?: string) {
  return api()<Org>('/orgs', {
    method: 'POST',
    body: JSON.stringify({ name, billingEmail }),
  });
}

export function getMyOrg() {
  return api()<MyOrgResponse>('/orgs/me', { method: 'GET' });
}

export function getOrgMembers() {
  return api()<OrgMember[]>('/orgs/me/members', { method: 'GET' });
}

export function addOrgMember(payload: { userId?: string; email?: string; orgRole?: string }) {
  return api()<OrgMember>('/orgs/me/members', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateOrgMember(memberId: string, payload: { orgRole?: string; status?: string }) {
  return api()<OrgMember>(`/orgs/me/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getSeats() {
  return api()<Seat[]>('/seats', { method: 'GET' });
}

export function assignSeat(payload: { userId: string; seatTier?: string }) {
  return api()<Seat>('/seats', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateSeat(seatId: string, payload: { seatTier?: string; status?: string }) {
  return api()<Seat>(`/seats/${seatId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function releaseSeat(seatId: string) {
  return api()<Seat>(`/seats/${seatId}/release`, { method: 'POST' });
}

export function getSeatUsage(period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return api()<{
    period: string;
    seats: SeatUsageRow[];
    totals: { minutesUsed: number; callsPlaced: number; rpcCount: number; overageMinutes: number };
  }>(`/seats/usage${qs}`, { method: 'GET' });
}

export function createSeatCheckout(payload: { planCode: string; seats: number }) {
  return api()<{ url: string; sessionId: string }>('/orgs/me/seat-checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createOrgBillingPortal() {
  return api()<{ url: string }>('/orgs/me/billing-portal', { method: 'POST' });
}
