import type { User, AuthResponse, LoginCredentials, RegisterData } from '../types';
export declare function createSettleApi(config: {
    getBaseUrl: () => string | Promise<string>;
    getToken: () => string | null | Promise<string | null>;
    onUnauthorized?: () => void;
}): {
    auth: {
        login: (credentials: LoginCredentials) => Promise<AuthResponse>;
        register: (data: RegisterData) => Promise<AuthResponse>;
        logout: () => Promise<void>;
        profile: () => Promise<User>;
    };
    users: {
        getProfile: () => Promise<User>;
        updateProfile: (data: Partial<User>) => Promise<User>;
    };
    credit: {
        /** Provider config status (no upstream call). 503-proof: safe to call unconfigured. */
        status: () => Promise<CreditProviderStatus>;
        /** Pull a credit report for a consumer (requires FCRA consent metadata). */
        pull: (payload: PullCreditPayload) => Promise<{
            report: CreditReportSummary;
            result: unknown;
        }>;
        /** List stored credit reports for a collection account. */
        reportsForAccount: (collectionAccountId: string) => Promise<CreditReportSummary[]>;
        /** Get a single report (raw provider response is stripped server-side). */
        report: (id: string) => Promise<CreditReportSummary>;
        /** Provider connectivity check (calls upstream — use sparingly). */
        health: () => Promise<{
            provider: string;
            healthy: boolean;
        }>;
    };
};
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
//# sourceMappingURL=index.d.ts.map