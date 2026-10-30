import { Injectable, Logger } from '@nestjs/common';
import {
  CreditProvider,
  CreditPullRequest,
  CreditPullResult,
  CreditBureauScore,
} from '../credit-provider.interface';

/**
 * SmartCredit / ConsumerDirect partner API provider.
 *
 * Token-based partner API ("passwordless") — partner key+secret authenticates
 * once, then client data is pulled without member credentials.
 *
 * Docs: https://developer.consumerdirect.io
 *
 * Env vars:
 *   SMARTCREDIT_API_KEY     — partner API key (PartnerHub → Integrations)
 *   SMARTCREDIT_API_SECRET  — partner secret (shown once at generation)
 *   SMARTCREDIT_PUBLISHER_IDN — publisher IDN (e.g. 57216)
 *   SMARTCREDIT_API_BASE_URL — optional override (defaults to prod)
 */
@Injectable()
export class SmartCreditProvider implements CreditProvider {
  private readonly logger = new Logger(SmartCreditProvider.name);
  private readonly baseUrl =
    process.env.SMARTCREDIT_API_BASE_URL || 'https://api.consumerdirect.com';
  private token: { value: string; expiresAt: number } | null = null;

  readonly name = 'smartcredit';

  isConfigured(): boolean {
    return !!(
      process.env.SMARTCREDIT_API_KEY && process.env.SMARTCREDIT_API_SECRET
    );
  }

  /** Obtain (and cache) a partner access token via key+secret. */
  async authenticate(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    const res = await fetch(`${this.baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: process.env.SMARTCREDIT_API_KEY,
        secret: process.env.SMARTCREDIT_API_SECRET,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      throw new Error(
        `SmartCredit auth failed: ${res.status} ${data.message || ''}`.trim(),
      );
    }
    this.token = {
      value: data.token,
      // default 55min if not returned
      expiresAt: Date.now() + ((data.expires_in || 3300) - 60) * 1000,
    };
    return this.token.value;
  }

  private async authedGet(path: string): Promise<any> {
    const token = await this.authenticate();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `SmartCredit ${path} failed: ${res.status} ${data.message || ''}`.trim(),
      );
    }
    return data;
  }

  /** List clients enrolled under our publisher IDN. */
  async listClients(): Promise<Record<string, any>> {
    return this.authedGet(
      `/api/v1/clients?publisherIdn=${process.env.SMARTCREDIT_PUBLISHER_IDN}`,
    );
  }

  /** Look up a client by email — resolves the member token for pulls. */
  async findClientByEmail(email: string): Promise<Record<string, any>> {
    return this.authedGet(
      `/api/v1/clients?email=${encodeURIComponent(email)}&publisherIdn=${process.env.SMARTCREDIT_PUBLISHER_IDN}`,
    );
  }

  /** Pull a member's credit report by their client token. */
  async getClientReport(clientToken: string): Promise<Record<string, any>> {
    return this.authedGet(`/api/v1/clients/${clientToken}/CreditReport`);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.authenticate();
      return true;
    } catch (e) {
      this.logger.warn(`SmartCredit healthCheck: ${(e as Error).message}`);
      return false;
    }
  }

  async pullCredit(req: CreditPullRequest): Promise<CreditPullResult> {
    if (!req.email) {
      throw new Error(
        'SmartCredit pulls require the member email (client lookup key)',
      );
    }
    const client = await this.findClientByEmail(req.email);
    const clientToken = client?.token || client?.clientToken || client?.id;
    if (!clientToken) {
      throw new Error(
        `No SmartCredit client found for ${req.email} — enroll them first`,
      );
    }
    const report = await this.getClientReport(String(clientToken));

    // Map ConsumerDirect report payload → normalized CreditPullResult.
    // Field names verified against developer.consumerdirect.io response schema.
    const scores: CreditBureauScore[] = (report.scores || []).map((s: any) => ({
      bureau: String(s.bureau || '').toLowerCase() as CreditBureauScore['bureau'],
      score: Number(s.score || s.value || 0),
      scoreModel: s.model || s.scoreModel || 'VantageScore 3.0',
      scoreDate: s.date || s.scoreDate,
    }));

    return {
      providerRequestId: report.requestId || report.id,
      scores,
      tradelines: (report.tradelines || []).map((t: any) => ({
        creditorName: t.creditor || t.creditorName,
        accountNumber: t.accountNumber,
        accountType: t.accountType || t.type,
        balance: t.balance != null ? Number(t.balance) : undefined,
        creditLimit: t.creditLimit != null ? Number(t.creditLimit) : undefined,
        monthlyPayment: t.monthlyPayment != null ? Number(t.monthlyPayment) : undefined,
        status: t.status || t.rating,
        openedDate: t.openedDate || t.opened,
        lastReported: t.lastReportedDate || t.lastReported,
        isCollection: t.isCollection,
      })),
      publicRecords: (report.publicRecords || []).map((p: any) => ({
        type: p.type,
        amount: p.amount != null ? Number(p.amount) : undefined,
        dateFiled: p.dateFiled || p.filedDate,
        dateResolved: p.dateResolved || p.resolvedDate,
      })),
      inquiries: (report.inquiries || []).map((i: any) => ({
        inquiryDate: i.inquiryDate || i.date,
        creditorName: i.creditor || i.creditorName,
        type: i.type,
      })),
      warnings: report.warnings || [],
      rawResponse: report,
      reportDate: report.reportDate || new Date().toISOString(),
    };
  }
}
