// API service factories following Prime pattern

import { createJsonApiClient } from '../auth';
import type { User, AuthResponse, LoginCredentials, RegisterData } from '../types';

export function createSettleApi(config: {
  getBaseUrl: () => string | Promise<string>;
  getToken: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
}) {
  const client = createJsonApiClient(config);

  return {
    auth: {
      login: (credentials: LoginCredentials) =>
        client<AuthResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify(credentials),
        }),
      register: (data: RegisterData) =>
        client<AuthResponse>('/auth/register', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      logout: () => client<void>('/auth/logout', { method: 'POST', body: '{}' }),
      profile: () => client<User>('/auth/profile', { method: 'GET' }),
    },
    users: {
      getProfile: () => client<User>('/users/profile', { method: 'GET' }),
      updateProfile: (data: Partial<User>) =>
        client<User>('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),
    },
    // Credit bureau (MyFreeScoreNow) — sales/admin only
    credit: {
      /** Provider config status (no upstream call). 503-proof: safe to call unconfigured. */
      status: () =>
        client<CreditProviderStatus>('/credit-bureau/status', { method: 'GET' }),
      /** Pull a credit report for a consumer (requires FCRA consent metadata). */
      pull: (payload: PullCreditPayload) =>
        client<{ report: CreditReportSummary; result: unknown }>(
          '/credit-bureau/pull',
          { method: 'POST', body: JSON.stringify(payload) },
        ),
      /** List stored credit reports for a collection account. */
      reportsForAccount: (collectionAccountId: string) =>
        client<CreditReportSummary[]>(
          `/credit-bureau/accounts/${collectionAccountId}/reports`,
          { method: 'GET' },
        ),
      /** Get a single report (raw provider response is stripped server-side). */
      report: (id: string) =>
        client<CreditReportSummary>(`/credit-bureau/reports/${id}`, { method: 'GET' }),
      /** Provider connectivity check (calls upstream — use sparingly). */
      health: () =>
        client<{ provider: string; healthy: boolean }>('/credit-bureau/health', {
          method: 'GET',
        }),
    },
  };
}

export interface CreditProviderStatus {
  provider: string;
  configured: boolean;
  environment: 'sandbox' | 'production';
  products: string[];
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

export interface CreditReportSummary {
  id: string;
  collectionAccountId: string;
  provider: string;
  status: 'pending' | 'success' | 'failed' | 'manual';
  creditScore?: number;
  reportDate?: string;
  accounts?: Record<string, unknown>[];
  inquiries?: Record<string, unknown>[];
  publicRecords?: Record<string, unknown>[];
  warnings?: string[];
  notes?: string;
  createdAt: string;
}
