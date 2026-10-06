import { createJsonApiClient } from '@settle/shared-sdk/auth';
import { getToken } from '@/lib/auth';

// Anonymous Q&A board API helpers. Public reads need no token; the client
// still forwards a Bearer token when one is stored so staff identities are
// attached server-side. Mirrors the pattern in src/lib/api.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.settleinpeace.com';

function api() {
  return createJsonApiClient({
    getBaseUrl: () => API_URL,
    getToken: () => getToken(),
    onUnauthorized: () => {},
  });
}

export type QaCategory =
  | 'probate'
  | 'debts'
  | 'taxes'
  | 'property'
  | 'family'
  | 'other';

export interface QaQuestionSummary {
  id: string;
  body: string;
  category: QaCategory;
  status: 'published' | 'hidden' | 'answered';
  answersCount: number;
  anonymous: true;
  createdAt: string;
}

export interface QaAnswer {
  id: string;
  body: string;
  isOfficial: boolean;
  authorLabel: string;
  createdAt: string;
}

export interface QaQuestionDetail extends QaQuestionSummary {
  answers: QaAnswer[];
}

export function listQuestions(category?: string) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return api()<QaQuestionSummary[]>(`/questions${qs}`, { method: 'GET' });
}

export function getQuestion(id: string) {
  return api()<QaQuestionDetail>(`/questions/${id}`, { method: 'GET' });
}

export function askQuestion(data: {
  body: string;
  category?: QaCategory;
  contactEmail?: string;
}) {
  return api()<QaQuestionSummary>('/questions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function answerQuestion(
  id: string,
  data: { body: string; contactEmail?: string },
) {
  return api()<QaAnswer>(`/questions/${id}/answers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
