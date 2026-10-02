import { createJsonApiClient } from '@settle/shared-sdk/auth';
import { clearAuth, getStoredRefreshToken, storeRefreshToken } from './authUtils';
import { getToken, setToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.settleinpeace.com';

type ApiData = Record<string, unknown>;

let refreshingPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) throw new Error('Refresh failed');
      const data = await response.json();
      if (!data.accessToken) throw new Error('No access token returned');
      setToken(data.accessToken);
      if (data.refreshToken) storeRefreshToken(data.refreshToken);
      return data.accessToken as string;
    } catch {
      clearAuth();
      return null;
    } finally {
      refreshingPromise = null;
    }
  })();

  return refreshingPromise;
}

function api(token?: string) {
  return createJsonApiClient({
    getBaseUrl: () => API_URL,
    getToken: () => token ?? getToken(),
    onUnauthorized: () => {}, // handled by authenticatedApi wrapper
  });
}

function authenticatedApi(token: string) {
  if (!token) throw new Error('You must be signed in to access this resource.');
  const client = api(token);
  return async function jsonApiCallWithRefresh<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      return await client<T>(endpoint, options);
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        const newToken = await refreshAccessToken();
        if (newToken) {
          return await api()<T>(endpoint, options);
        }
      }
      clearAuth();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw err;
    }
  };
}

export function getAuthenticatedApi() {
  return authenticatedApi(getToken() ?? '');
}
export function login(email: string, password: string) {
  return api()<ApiData>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export function register(userData: ApiData) {
  return api()<ApiData>('/auth/register', { method: 'POST', body: JSON.stringify(userData) });
}
export function forgotPassword(email: string) {
  return api()<ApiData>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}
export function resetPassword(token: string, password: string) {
  return api()<ApiData>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password, confirmPassword: password }),
  });
}
export function getProfile(token: string) {
  return authenticatedApi(token)<ApiData>('/auth/profile', { method: 'GET' });
}
export function updateProfile(token: string, data: ApiData) {
  return authenticatedApi(token)<ApiData>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) });
}

// Assessment / leads
export function submitAssessment(data: ApiData) {
  return api()<ApiData>('/leads/assessment', { method: 'POST', body: JSON.stringify(data) });
}
export function getUserLeads(token: string) {
  return authenticatedApi(token)<ApiData[]>('/leads/my-leads', { method: 'GET' });
}
export function getLeadById(token: string, id: string) {
  return authenticatedApi(token)<ApiData>(`/leads/${id}/details`, { method: 'GET' });
}

// Providers
export function getProviders(token?: string) {
  return api(token)<ApiData[]>('/providers', { method: 'GET' });
}
export function compareProviders(leadId: string, token?: string | null) {
  return api(token ?? undefined)<ApiData[]>(`/matching/recommended/${leadId}`, { method: 'GET' });
}
export function signupAsProvider(data: ApiData) {
  return api()<ApiData>('/providers/signup', { method: 'POST', body: JSON.stringify(data) });
}

// Debts
export function getDebts(token: string) {
  return authenticatedApi(token)<ApiData[]>('/debts', { method: 'GET' });
}
export function createDebt(token: string, data: ApiData) {
  return authenticatedApi(token)<ApiData>('/debts', { method: 'POST', body: JSON.stringify(data) });
}
export function updateDebt(token: string, id: string, data: ApiData) {
  return authenticatedApi(token)<ApiData>(`/debts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteDebt(token: string, id: string) {
  return authenticatedApi(token)<ApiData>(`/debts/${id}`, { method: 'DELETE' });
}

// Provider portal
export function getPortalLeads(token: string) {
  return authenticatedApi(token)<ApiData[]>('/matching/matched-leads', { method: 'GET' });
}
export function purchaseLead(token: string, leadId: string) {
  return authenticatedApi(token)<ApiData>(`/leads/${leadId}/purchase`, { method: 'POST' });
}
export function declineLead(token: string, leadId: string) {
  return authenticatedApi(token)<ApiData>(`/matching/${leadId}/decline`, { method: 'POST' });
}
export function getProviderBilling(token: string) {
  return authenticatedApi(token)<ApiData>('/providers/portal/stats', { method: 'GET' });
}
export function createCheckoutSession(token: string, packageType: number) {
  return authenticatedApi(token)<ApiData>('/stripe/checkout', {
    method: 'POST',
    body: JSON.stringify({ credits: packageType }),
  });
}

export async function createCoachingCheckoutSession(token: string, returnUrl: string) {
  return authenticatedApi(token)<{ url: string; sessionId: string }>('/stripe/coaching/checkout', {
    method: 'POST',
    body: JSON.stringify({ returnUrl }),
  });
}

export function createLeadCheckoutSession(token: string, leadId: string) {
  return authenticatedApi(token)<{ url: string; sessionId: string }>('/stripe/lead-checkout', {
    method: 'POST',
    body: JSON.stringify({ leadId }),
  });
}

export function createProviderSubscriptionSession(token: string, tierId: string) {
  return authenticatedApi(token)<{ url: string; sessionId: string }>('/stripe/provider-subscription', {
    method: 'POST',
    body: JSON.stringify({ tierId }),
  });
}

export function createBillingPortalSession(token: string) {
  return authenticatedApi(token)<{ url: string }>('/stripe/billing-portal', { method: 'POST' });
}

// Billing / deposits
export function submitDeposit(token: string, data: { amount: number; method: string; reference?: string; notes?: string }) {
  return authenticatedApi(token)<{ id: string; status: string }>('/billing/deposits', { method: 'POST', body: JSON.stringify(data) });
}

export function getMyDeposits(token: string, status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return authenticatedApi(token)<any[]>(`/billing/deposits${qs}`, { method: 'GET' });
}

export function getAdminDeposits(token: string, status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return authenticatedApi(token)<any[]>(`/billing/admin/deposits${qs}`, { method: 'GET' });
}

export function approveDeposit(token: string, id: string) {
  return authenticatedApi(token)<{ id: string; status: string }>(`/billing/admin/deposits/${id}/approve`, { method: 'POST' });
}

export function rejectDeposit(token: string, id: string, reason?: string) {
  return authenticatedApi(token)<{ id: string; status: string }>(`/billing/admin/deposits/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function manualDeposit(token: string, data: { providerId: string; amount: number; method: string; reference?: string; notes?: string }) {
  return authenticatedApi(token)<any>('/billing/admin/deposits', { method: 'POST', body: JSON.stringify(data) });
}

export function runBillingRenewals(token: string) {
  return authenticatedApi(token)<{ success: boolean }>('/billing/admin/run-renewals', { method: 'POST' });
}

// Matching
export function getMatches(token: string) {
  return authenticatedApi(token)<ApiData[]>('/matching/history', { method: 'GET' });
}
export function getMatchById(token: string, id: string) {
  return authenticatedApi(token)<ApiData>(`/matching/${id}`, { method: 'GET' });
}

export interface BudgetExpense {
  id?: string;
  name: string;
  amount: number;
  category: string;
  recurring?: boolean;
}

export interface Budget {
  id: string;
  monthlyIncome: number;
  expenses: BudgetExpense[];
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  type: 'debt_payoff' | 'savings' | 'emergency_fund';
  deadline?: string;
  completed: boolean;
}

export interface CoachingDashboard {
  budgets: Budget[];
  goals: Goal[];
  subscription: { status: string; stripeSubscriptionId: string | null; startedAt: string | null; canceledAt: string | null };
  summary: { totalMonthlyIncome: number; totalMonthlyExpenses: number; netMonthly: number; activeGoals: number; completedGoals: number; totalGoals: number };
}

export interface BudgetPayload { monthlyIncome: number; expenses?: BudgetExpense[]; }
export interface GoalPayload { title: string; targetAmount: number; currentAmount?: number; type?: Goal['type']; deadline?: string; }

function coachingApi() { return authenticatedApi(getToken() ?? ''); }
export function getCoachingDashboard() { return coachingApi()<CoachingDashboard>('/coaching/dashboard', { method: 'GET' }); }
export function getBudgets() { return coachingApi()<Budget[]>('/coaching/budgets', { method: 'GET' }); }
export function createBudget(data: BudgetPayload) { return coachingApi()<Budget>('/coaching/budgets', { method: 'POST', body: JSON.stringify(data) }); }
export function updateBudget(id: string, data: BudgetPayload) { return coachingApi()<Budget>(`/coaching/budgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
export function deleteBudget(id: string) { return coachingApi()<{ success: boolean }>(`/coaching/budgets/${id}`, { method: 'DELETE' }); }
export function getGoals() { return coachingApi()<Goal[]>('/coaching/goals', { method: 'GET' }); }
export function createGoal(data: GoalPayload) { return coachingApi()<Goal>('/coaching/goals', { method: 'POST', body: JSON.stringify(data) }); }
export function updateGoalProgress(id: string, currentAmount: number) { return coachingApi()<Goal>(`/coaching/goals/${id}/progress`, { method: 'PUT', body: JSON.stringify({ currentAmount }) }); }
export function deleteGoal(id: string) { return coachingApi()<{ success: boolean }>(`/coaching/goals/${id}`, { method: 'DELETE' }); }

// ── Credit bureau (MyFreeScoreNow) — sales/admin only ────────────────────
// Mirrors the `credit` namespace added to `createSettleApi` in shared-sdk.
function creditApi() { return authenticatedApi(getToken() ?? ''); }

export interface CreditProviderStatus {
  provider: string;
  configured: boolean;
  environment: 'sandbox' | 'production';
  products: string[];
}

export interface CreditReportSummary {
  id: string;
  collectionAccountId: string;
  provider: string;
  status: 'pending' | 'success' | 'failed' | 'manual';
  creditScore?: number;
  reportDate?: string;
  accounts?: Record<string, any>[];
  inquiries?: Record<string, any>[];
  publicRecords?: Record<string, any>[];
  warnings?: string[];
  notes?: string;
  createdAt: string;
}

export interface PullCreditPayload {
  firstName: string;
  lastName: string;
  ssn?: string;
  dateOfBirth?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  pullType: 'soft' | 'hard';
  product: 'credit_snapshot' | 'funding_snapshot' | '3b_report';
  permissiblePurpose: string;
  consent: {
    grantedAt: string;
    method: 'web_form' | 'phone' | 'paper' | 'imported';
    ipAddress?: string;
    userAgent?: string;
    consentLanguage?: string;
  };
  referenceId?: string;
  collectionAccountId?: string;
}

/** Provider config status — safe to call even when MFSN is unconfigured. */
export function getCreditProviderStatus() {
  return creditApi()<CreditProviderStatus>('/credit-bureau/status', { method: 'GET' });
}
export function pullCreditReport(payload: PullCreditPayload) {
  return creditApi()<{ report: CreditReportSummary; result: any }>('/credit-bureau/pull', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function getCreditReports(collectionAccountId: string) {
  return creditApi()<CreditReportSummary[]>(
    `/credit-bureau/accounts/${collectionAccountId}/reports`,
    { method: 'GET' },
  );
}
export function getCreditReport(id: string) {
  return creditApi()<CreditReportSummary>(`/credit-bureau/reports/${id}`, { method: 'GET' });
}
