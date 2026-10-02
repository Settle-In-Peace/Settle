'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CreditProviderStatus,
  CreditReportSummary,
  PullCreditPayload,
  getCreditProviderStatus,
  getCreditReports,
  pullCreditReport,
} from '@/lib/api';

/**
 * Credit reports panel for a collection account (MyFreeScoreNow via
 * settle-api /credit-bureau/*).
 *
 * Graceful degradation: when the MFSN integration is not configured on the
 * API (missing MFSN_API_USER/MFSN_API_PASSWORD) the panel renders a setup
 * hint instead of the pull form — it never crashes the page.
 */

const PERMISSIBLE_PURPOSES = [
  { value: 'account_review', label: 'Account review (FCRA §1681b(a)(3)(A))' },
  { value: 'collection', label: 'Collection of an account' },
  { value: 'credit_transaction', label: 'Credit transaction' },
  { value: 'written_instruction', label: 'Written instructions of consumer' },
];

const PRODUCTS = [
  { value: 'credit_snapshot', label: 'Credit Snapshot (soft pull — score + summary)' },
  { value: 'funding_snapshot', label: 'Funding Snapshot (soft pull — qualification)' },
  { value: '3b_report', label: '3-Bureau Report (full tri-bureau report)' },
] as const;

const inputCls =
  'w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm';
const labelCls = 'block text-xs text-zinc-500 dark:text-zinc-400 mb-1';

export default function CreditReportsPanel({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<CreditProviderStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [reports, setReports] = useState<CreditReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pullOpen, setPullOpen] = useState(false);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await getCreditReports(accountId);
      setReports(list || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load credit reports');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      try {
        const s = await getCreditProviderStatus();
        if (!cancelled) setStatus(s);
      } catch {
        // Not authenticated as sales/admin or API unreachable — treat as unknown
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handlePull = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPulling(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const consentGiven = fd.get('consent') === 'on';
    if (!consentGiven) {
      setError('Consumer consent is required before pulling credit (FCRA).');
      setPulling(false);
      return;
    }

    const payload: PullCreditPayload = {
      firstName: String(fd.get('firstName') || '').trim(),
      lastName: String(fd.get('lastName') || '').trim(),
      product: fd.get('product') as PullCreditPayload['product'],
      pullType: fd.get('pullType') as PullCreditPayload['pullType'],
      permissiblePurpose: String(fd.get('permissiblePurpose') || 'account_review'),
      collectionAccountId: accountId,
      consent: {
        grantedAt: new Date().toISOString(),
        method: 'web_form',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
    };
    const optional = ['ssn', 'dateOfBirth', 'streetAddress', 'city', 'state', 'zip', 'phone', 'email'] as const;
    for (const key of optional) {
      const v = String(fd.get(key) || '').trim();
      if (v) (payload as any)[key] = v;
    }

    try {
      await pullCreditReport(payload);
      setPullOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Credit pull failed');
    } finally {
      setPulling(false);
    }
  };

  const formatCurrency = (n?: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  return (
    <div className="space-y-4">
      {/* Provider status */}
      {statusLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking credit provider…</p>
      ) : status && !status.configured ? (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Credit pulls not configured</p>
          <p className="mt-1 text-xs">
            Set <code>MFSN_API_USER</code> and <code>MFSN_API_PASSWORD</code> on the API to enable
            MyFreeScoreNow ({status.environment} mode). Reports previously pulled still appear below.
          </p>
        </div>
      ) : null}

      {/* Reports list */}
      {loading && !reports.length ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading credit reports…</p>
      ) : reports.length ? (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-900 dark:text-white">
                  {r.creditScore != null ? `Score ${r.creditScore}` : 'Credit report'}
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    r.status === 'success'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : r.status === 'failed'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {r.provider} · report date {r.reportDate || '—'} · pulled{' '}
                {new Date(r.createdAt).toLocaleString()}
              </div>
              {(r.accounts?.length ?? 0) > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Tradelines ({r.accounts!.length})
                  </div>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
                    {r.accounts!.slice(0, 5).map((a, i) => (
                      <li key={i}>
                        {(a.creditorName as string) || 'Account'}{' '}
                        {a.balance != null ? `— ${formatCurrency(a.balance as number)}` : ''}
                        {a.status ? ` (${a.status})` : ''}
                      </li>
                    ))}
                    {r.accounts!.length > 5 && <li>…and {r.accounts!.length - 5} more</li>}
                  </ul>
                </div>
              )}
              {(r.warnings?.length ?? 0) > 0 && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {r.warnings!.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No credit reports on file.</p>
      )}

      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Pull form — only when provider is configured */}
      {status?.configured && !pullOpen && (
        <button
          onClick={() => setPullOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
        >
          Pull Credit Report
        </button>
      )}

      {status?.configured && pullOpen && (
        <form
          onSubmit={handlePull}
          className="space-y-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First name *</label>
              <input name="firstName" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last name *</label>
              <input name="lastName" required className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Product</label>
              <select name="product" defaultValue="credit_snapshot" className={inputCls}>
                {PRODUCTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Pull type</label>
              <select name="pullType" defaultValue="soft" className={inputCls}>
                <option value="soft">Soft (no score impact)</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Permissible purpose (FCRA)</label>
            <select name="permissiblePurpose" defaultValue="account_review" className={inputCls}>
              {PERMISSIBLE_PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>SSN (optional for soft pull)</label>
              <input name="ssn" placeholder="XXX-XX-XXXX" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date of birth</label>
              <input name="dateOfBirth" type="date" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Street address</label>
            <input name="streetAddress" className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>City</label>
              <input name="city" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input name="state" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input name="zip" className={inputCls} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input name="consent" type="checkbox" className="mt-0.5" />
            <span>
              The consumer has provided written/electronic consent for this credit pull, and a
              permissible purpose under FCRA applies. Consent metadata (timestamp, method, user
              agent) is recorded for audit.
            </span>
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pulling}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {pulling ? 'Pulling…' : 'Submit Pull'}
            </button>
            <button
              type="button"
              onClick={() => setPullOpen(false)}
              className="px-4 py-2 text-zinc-600 dark:text-zinc-300 hover:underline text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
