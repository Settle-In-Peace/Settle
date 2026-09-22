/**
 * Provider-neutral credit data interface.
 * Each provider (MyFreeScoreNow, future direct bureau integrations) implements this.
 */

export enum CreditPullType {
  SOFT = 'soft',
  HARD = 'hard',
}

export enum CreditReportProduct {
  CREDIT_SNAPSHOT = 'credit_snapshot',
  FUNDING_SNAPSHOT = 'funding_snapshot',
  THREE_B_REPORT = '3b_report',
}

export interface CreditPullRequest {
  /** Consumer PII — only fields the provider needs */
  firstName: string;
  lastName: string;
  /** SSN is optional for soft pulls (name + address only) */
  ssn?: string;
  dateOfBirth?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  /** Soft (no score impact) or hard pull */
  pullType: CreditPullType;
  /** Which product to request */
  product: CreditReportProduct;
  /** FCRA permissible purpose code (e.g. "credit_transaction", "account_review") */
  permissiblePurpose: string;
  /** Consumer consent metadata */
  consent: {
    grantedAt: Date;
    method: 'web_form' | 'phone' | 'paper' | 'imported';
    ipAddress?: string;
    userAgent?: string;
    consentLanguage?: string;
  };
  /** Internal reference (lead ID, collection account ID, etc.) */
  referenceId?: string;
}

export interface CreditBureauScore {
  bureau: 'equifax' | 'experian' | 'transunion';
  score: number;
  scoreModel?: string;
  range?: { min: number; max: number };
  riskLevel?: string;
}

export interface CreditBureauTradeline {
  creditorName?: string;
  accountNumber?: string;
  accountType?: string;
  balance?: number;
  creditLimit?: number;
  monthlyPayment?: number;
  status?: string;
  openedDate?: string;
  lastReported?: string;
  isCollection?: boolean;
}

export interface CreditBureauPublicRecord {
  type?: string;
  amount?: number;
  dateFiled?: string;
  dateResolved?: string;
}

export interface CreditBureauInquiry {
  inquiryDate?: string;
  creditorName?: string;
  type?: string;
}

export interface CreditPullResult {
  /** Provider-side request ID for audit trail */
  providerRequestId?: string;
  /** Normalized scores from each bureau */
  scores: CreditBureauScore[];
  /** Normalized tradelines across all bureaus */
  tradelines: CreditBureauTradeline[];
  /** Public records (bankruptcies, liens, judgments) */
  publicRecords: CreditBureauPublicRecord[];
  /** Recent inquiries */
  inquiries: CreditBureauInquiry[];
  /** Provider warnings or fraud alerts */
  warnings: string[];
  /** Raw provider response (stored encrypted/at rest, never sent to browser) */
  rawResponse: Record<string, any>;
  /** When the report was generated */
  reportDate: string;
}

export interface CreditProvider {
  /** Provider identifier (e.g. "myfreescorenow") */
  readonly name: string;

  /** Authenticate with the provider and cache the token */
  authenticate(): Promise<string>;

  /** Pull a credit report */
  pullCredit(req: CreditPullRequest): Promise<CreditPullResult>;

  /** Health check — verify credentials are valid */
  healthCheck(): Promise<boolean>;
}
