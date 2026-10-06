import { createJsonApiClient } from '@settle/shared-sdk/auth';
import { getToken } from '@/lib/auth';

// Community/feature-board API helpers. Mirrors the client pattern in
// src/lib/api.ts (kept here so shared files stay untouched by other agents).
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.settleinpeace.com';

function api() {
  return createJsonApiClient({
    getBaseUrl: () => API_URL,
    getToken: () => getToken(),
    onUnauthorized: () => {},
  });
}

export type FeatureRequestStatus =
  | 'under_review'
  | 'planned'
  | 'in_progress'
  | 'shipped'
  | 'declined';

export interface FeatureRequest {
  id: string;
  title: string;
  body?: string;
  category: string;
  status: FeatureRequestStatus;
  votes: number;
  authorName: string;
  createdAt: string;
}

export function listFeatureRequests(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return api()<FeatureRequest[]>(`/feedback${qs}`, { method: 'GET' });
}

export function submitFeatureRequest(data: {
  title: string;
  body?: string;
  category?: string;
  authorName?: string;
  email?: string;
}) {
  return api()<FeatureRequest>('/feedback', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function voteFeatureRequest(id: string, voterId: string) {
  return api()<{ id: string; votes: number; voted: boolean }>(
    `/feedback/${id}/vote`,
    { method: 'POST', body: JSON.stringify({ voterId }) },
  );
}

// ── localStorage vote identity ───────────────────────────────────────────
const VOTER_ID_KEY = 'settle_voter_id';
const VOTED_KEY = 'settle_voted';

export function getVoterId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(VOTER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_ID_KEY, id);
  }
  return id;
}

export function getVotedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function setVotedFlag(id: string, voted: boolean) {
  if (typeof window === 'undefined') return;
  const set = getVotedIds();
  if (voted) set.add(id);
  else set.delete(id);
  localStorage.setItem(VOTED_KEY, JSON.stringify([...set]));
}
