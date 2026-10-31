import { api } from './api';

export const QA_CATEGORIES = ['probate', 'debts', 'taxes', 'property', 'family', 'other'] as const;

export interface QaQuestion {
  id: string;
  body: string;
  category?: string;
  status?: string;
  answersCount?: number;
  createdAt: string;
}

export interface QaAnswer {
  id: string;
  body: string;
  label?: string;
  official?: boolean;
  createdAt: string;
}

export async function listQuestions(category?: string): Promise<QaQuestion[]> {
  const res = await api.get('/questions', { params: category ? { category } : {} });
  const d = res.data;
  return d.items ?? d.questions ?? d ?? [];
}

export async function getQuestion(id: string): Promise<{ question: QaQuestion | null; answers: QaAnswer[] }> {
  const res = await api.get(`/questions/${id}`);
  const d = res.data;
  return {
    question: d.question ?? d ?? null,
    answers: d.answers ?? [],
  };
}

export async function createQuestion(input: { body: string; category?: string; contactEmail?: string }) {
  const res = await api.post('/questions', input);
  return res.data;
}

export async function answerQuestion(id: string, body: string) {
  const res = await api.post(`/questions/${id}/answers`, { body });
  return res.data;
}

/* ------------------------------- coaching ------------------------------ */

export interface Budget {
  id: string;
  name?: string;
  category?: string;
  amount?: number;
  amountCents?: number;
  spent?: number;
  period?: string;
  [k: string]: unknown;
}

export interface Goal {
  id: string;
  title?: string;
  name?: string;
  targetAmount?: number;
  targetCents?: number;
  currentAmount?: number;
  currentCents?: number;
  deadline?: string;
  [k: string]: unknown;
}

export async function coachingDashboard() {
  const res = await api.get('/coaching/dashboard');
  return res.data;
}

export async function listBudgets(): Promise<Budget[]> {
  const res = await api.get('/coaching/budgets');
  const d = res.data;
  return d.budgets ?? d.items ?? d ?? [];
}

export async function createBudget(input: Record<string, unknown>) {
  const res = await api.post('/coaching/budgets', input);
  return res.data;
}

export async function deleteBudget(id: string) {
  await api.delete(`/coaching/budgets/${id}`);
}

export async function listGoals(): Promise<Goal[]> {
  const res = await api.get('/coaching/goals');
  const d = res.data;
  return d.goals ?? d.items ?? d ?? [];
}

export async function createGoal(input: Record<string, unknown>) {
  const res = await api.post('/coaching/goals', input);
  return res.data;
}

export async function deleteGoal(id: string) {
  await api.delete(`/coaching/goals/${id}`);
}
