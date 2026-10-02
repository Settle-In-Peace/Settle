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

// ── High-risk payment processors (NMI / AuthNet / Stripe fallback) ────────
// Card data NEVER touches settle-api — charges use single-use processor
// tokens produced by hosted fields (NMI Collect.js / AuthNet Accept.js).
function paymentsApi() { return authenticatedApi(getToken() ?? ''); }

export interface HostedFieldsConfig {
  kind: 'collectjs' | 'acceptjs' | 'stripejs' | string;
  scriptUrl: string;
  tokenizationKey?: string;
  clientKey?: string;
  apiLoginId?: string;
  variant?: string;
}

export interface ProcessorStatusEntry {
  name: 'nmi' | 'authorizenet' | 'stripe' | string;
  configured: boolean;
  environment?: 'sandbox' | 'production';
  priority: number;
  capabilities: string[];
  hostedFields?: HostedFieldsConfig;
}

export interface ProcessorStatusResponse {
  priority: string[];
  processors: ProcessorStatusEntry[];
}

export interface ProcessorPayment {
  id: string;
  debtorId?: string;
  collectionAccountId?: string;
  debtId?: string;
  processor: string;
  type: 'sale' | 'refund' | 'void' | 'recurring_sale';
  status: 'approved' | 'declined' | 'voided' | 'refunded' | 'error' | 'pending';
  amountCents: number;
  currency: string;
  convenienceFeeCents: number;
  processorTxnId?: string;
  authCode?: string;
  responseText?: string;
  cardBrand?: string;
  cardLast4?: string;
  permitted: boolean;
  disclosureText?: string;
  disclosureAcknowledgedAt?: string;
  failureReason?: string;
  createdAt: string;
}

export interface ChargeProcessorPaymentPayload {
  collectionAccountId: string;
  debtorId?: string;
  debtId?: string;
  paymentPlanId?: string;
  amountCents: number;
  convenienceFeeCents?: number;
  paymentToken?: string;
  vaultId?: string;
  description?: string;
  processor?: string;
  disclosureAcknowledged: boolean;
  disclosureText?: string;
  idempotencyKey?: string;
}

export function getPaymentProcessorStatus() {
  return paymentsApi()<ProcessorStatusResponse>('/payment-processors/status', { method: 'GET' });
}
export function chargeProcessorPayment(payload: ChargeProcessorPaymentPayload) {
  return paymentsApi()<ProcessorPayment>('/payment-processors/charge', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function refundProcessorPayment(paymentId: string, amountCents?: number, reason?: string) {
  return paymentsApi()<ProcessorPayment>('/payment-processors/refund', {
    method: 'POST',
    body: JSON.stringify({ paymentId, amountCents, reason }),
  });
}
export function voidProcessorPayment(paymentId: string) {
  return paymentsApi()<ProcessorPayment>('/payment-processors/void', {
    method: 'POST',
    body: JSON.stringify({ paymentId }),
  });
}
export function getAccountProcessorPayments(collectionAccountId: string) {
  return paymentsApi()<ProcessorPayment[]>(
    `/payment-processors/accounts/${collectionAccountId}/payments`,
    { method: 'GET' },
  );
}
export function getDebtProcessorPayments(debtId: string) {
  return paymentsApi()<ProcessorPayment[]>(
    `/payment-processors/debts/${debtId}/payments`,
    { method: 'GET' },
  );
}

// ── Lead vendors (ping/post purchase + webhook/CSV import) — sales/admin ──
function leadVendorsApi() { return authenticatedApi(getToken() ?? ''); }

export interface LeadVendorStatus {
  name: string;
  displayName: string;
  configured: boolean;
  active: boolean;
  supportsPingPost: boolean;
  products: { id: string; name: string; price?: number; delivery?: string }[];
}

export interface LeadImportBatch {
  id: string;
  vendorName: string;
  source: 'webhook' | 'csv' | 'ping_post' | 'api_order';
  filename?: string;
  status: 'processing' | 'completed' | 'failed';
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  totalCost?: number;
  rowErrors?: { row: number; reason: string }[];
  error?: string;
  createdAt: string;
}

export interface VendorLead {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  state?: string;
  totalDebt?: number;
  debtTypes?: string[];
  qualityScore: number;
  qualityTier?: string;
  scoreFactors?: Record<string, unknown>;
  status: string;
  vendorName?: string;
  vendorLeadId?: string;
  importBatchId?: string;
  purchaseCost?: number;
  duplicateOf?: string;
  collectionAccountId?: string;
  tcpaConsent?: boolean;
  createdAt: string;
}

export interface VendorLeadList {
  leads: VendorLead[];
  total: number;
  page: number;
  limit: number;
}

export interface LeadPurchase {
  id: string;
  vendorName: string;
  criteria?: Record<string, any>;
  quantityRequested: number;
  quantityReceived: number;
  pricePerLead?: number;
  totalCost?: number;
  status: 'pending' | 'pinged' | 'posted' | 'completed' | 'rejected' | 'failed';
  importBatchId?: string;
  error?: string;
  createdAt: string;
}

export function getLeadVendorStatuses() {
  return leadVendorsApi()<LeadVendorStatus[]>('/lead-vendors', { method: 'GET' });
}
export function getLeadVendor(name: string) {
  return leadVendorsApi()<LeadVendorStatus>(`/lead-vendors/vendors/${encodeURIComponent(name)}`, { method: 'GET' });
}
export function priceVendorLead(vendor: string, criteria: Record<string, unknown>) {
  return leadVendorsApi()<{ accepted: boolean; price?: number; rejectionReason?: string }>('/lead-vendors/price', {
    method: 'POST',
    body: JSON.stringify({ vendor, ...criteria }),
  });
}
export function purchaseVendorLeads(payload: {
  vendor: string;
  quantity: number;
  states?: string[];
  debtTypes?: string[];
  minDebt?: number;
  maxDebt?: number;
  maxPricePerLead?: number;
}) {
  return leadVendorsApi()<{ purchase: LeadPurchase }>('/lead-vendors/purchase', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function getLeadPurchases(vendor?: string) {
  const qs = vendor ? `?vendor=${encodeURIComponent(vendor)}` : '';
  return leadVendorsApi()<LeadPurchase[]>(`/lead-vendors/purchases${qs}`, { method: 'GET' });
}
export function getLeadImportBatches(vendor?: string) {
  const qs = vendor ? `?vendor=${encodeURIComponent(vendor)}` : '';
  return leadVendorsApi()<LeadImportBatch[]>(`/lead-vendors/batches${qs}`, { method: 'GET' });
}
export function importVendorCsv(vendor: string, csv: string, filename?: string) {
  return leadVendorsApi()<{ batch: LeadImportBatch }>('/lead-vendors/import/csv', {
    method: 'POST',
    body: JSON.stringify({ vendor, csv, filename }),
  });
}
export function getVendorLeads(filter: {
  vendor?: string;
  batchId?: string;
  minScore?: number;
  status?: string;
  disposition?: 'all' | 'imported' | 'duplicates';
  search?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return leadVendorsApi()<VendorLeadList>(`/lead-vendors/leads${qs ? `?${qs}` : ''}`, { method: 'GET' });
}
export function assignVendorLeadToCollections(leadId: string) {
  return leadVendorsApi()<{ account: any; alreadyAssigned: boolean }>(
    `/lead-vendors/leads/${leadId}/assign-collections`,
    { method: 'POST' },
  );
}
