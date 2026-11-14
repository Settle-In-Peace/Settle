'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';
import { API_URL } from '@/lib/apiUrl';

interface Enrollment {
  id: string;
  status: 'pending' | 'active' | 'paused' | 'cancelled' | 'unenrolled';
  provider: string;
  memberEmail: string;
  consentGrantedAt?: string | null;
  lastPulledAt?: string | null;
  createdAt: string;
}

interface Snapshot {
  id: string;
  pulledAt: string;
  score: number | null;
  scoreModel: string | null;
  bureau: string | null;
  tradelineCount: number;
  tradelines: {
    creditorName?: string;
    accountType?: string;
    balance?: number;
    creditLimit?: number;
    status?: string;
    openedDate?: string;
    lastReported?: string;
    isCollection?: boolean;
  }[];
  inquiries: { creditorName?: string | null; inquiryDate?: string | null; type?: string | null }[];
  publicRecords: { type?: string; amount?: number; dateFiled?: string }[];
  createdAt: string;
}

interface CreditAlert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  payload: { summary?: string; [k: string]: unknown };
  readAt?: string | null;
  createdAt: string;
}

interface MonitorStatus {
  configured: boolean;
  enrolled: boolean;
  enrollment?: Enrollment;
  latestSnapshot?: Snapshot | null;
  previousScore?: number | null;
  unreadAlerts?: number;
  refreshIntervalDays?: number;
  memberActive?: boolean;
  guidance?: string;
}

const CONSENT_TEXT =
  'I authorize Settle In Peace to obtain my consumer credit report and score through its credit bureau partner for the purpose of ongoing credit monitoring. I understand these are soft inquiries that do not affect my credit score, and that I may cancel monitoring at any time.';

const SEVERITY_STYLES: Record<string, string> = {
  info: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
  warning: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
  critical: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  score_change: 'Score change',
  new_tradeline: 'New account',
  closed_tradeline: 'Account closed',
  balance_change: 'Balance change',
  new_inquiry: 'New inquiry',
  new_derogatory: 'Derogatory item',
};

export default function CreditMonitoringPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [alerts, setAlerts] = useState<CreditAlert[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${getStoredToken()}`,
    'Content-Type': 'application/json',
  }), []);

  const loadAll = useCallback(async () => {
    const headers = { Authorization: `Bearer ${getStoredToken()}` };
    try {
      const statusRes = await fetch(`${API_URL}/credit-monitoring/status`, { headers });
      if (statusRes.status === 503) {
        setUnavailable(true);
        return;
      }
      if (statusRes.status === 401) {
        router.push('/login');
        return;
      }
      const s: MonitorStatus = await statusRes.json();
      setStatus(s);
      if (s.enrolled) {
        const [alertsRes, snapsRes] = await Promise.all([
          fetch(`${API_URL}/credit-monitoring/alerts`, { headers }),
          fetch(`${API_URL}/credit-monitoring/snapshots`, { headers }),
        ]);
        if (alertsRes.ok) setAlerts(await alertsRes.json());
        if (snapsRes.ok) setSnapshots(await snapsRes.json());
      }
    } catch {
      setError('Could not load credit monitoring. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = getStoredToken();
    const stored = getStoredUser();
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    setUser(stored);
    loadAll();
  }, [router, loadAll]);

  const handleEnroll = async () => {
    if (!consentChecked) return;
    setEnrolling(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/credit-monitoring/enroll`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          method: 'web_form',
          consentLanguage: CONSENT_TEXT,
        }),
      });
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Enrollment failed');
      setStatus((prev) => ({
        ...(prev ?? { configured: true }),
        enrolled: true,
        enrollment: data.enrollment,
        guidance: data.guidance,
      }));
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Enrollment failed. Please try again.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/credit-monitoring/refresh`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError(data.message || 'You can refresh once per day.');
        return;
      }
      if (!res.ok) throw new Error(data.message || 'Refresh failed');
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Refresh failed. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`${API_URL}/credit-monitoring/alerts/${id}/read`, {
        method: 'POST',
        headers: authHeaders(),
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, readAt: new Date().toISOString() } : a)),
      );
    } catch {
      // non-fatal
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-zinc-500">Loading credit monitoring...</div>
        </div>
      </div>
    );
  }

  const backHref = user?.role === 'provider' ? '/portal' : '/dashboard';
  const latest = status?.latestSnapshot ?? null;
  const scoreDelta =
    latest?.score != null && status?.previousScore != null
      ? latest.score - status.previousScore
      : null;
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 10);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={backHref} className="text-blue-600 text-sm hover:underline">
            ← Back to {user?.role === 'provider' ? 'Portal' : 'Dashboard'}
          </Link>
          <span className="text-sm text-zinc-500">{user?.email}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-black text-black dark:text-white mb-2">Credit Monitoring</h1>
        <p className="text-zinc-500 mb-8">
          Keep an eye on your credit report — new accounts, inquiries, balance changes, and score movement, all in one place.
        </p>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm flex items-start justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-4 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {unavailable ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-12 text-center">
            <h3 className="text-lg font-bold text-black dark:text-white mb-2">Credit monitoring isn't available yet</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto">
              This feature is being set up. Check back soon, or contact{' '}
              <a href="mailto:help@settleinpeace.com" className="text-blue-600 dark:text-blue-400 hover:underline">help@settleinpeace.com</a>{' '}
              if you have questions.
            </p>
          </div>
        ) : !status?.enrolled ? (
          /* ── Enroll CTA ── */
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-8">
            <h2 className="text-xl font-bold text-black dark:text-white mb-3">Turn on credit monitoring</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 max-w-2xl">
              We'll check your credit report on a regular cadence and flag changes — new accounts,
              inquiries, balance moves, and score movement. Reports are pulled as soft inquiries,
              which do not affect your credit score.
            </p>
            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{CONSENT_TEXT}</span>
            </label>
            <button
              onClick={handleEnroll}
              disabled={!consentChecked || enrolling}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40"
            >
              {enrolling ? 'Enrolling…' : 'Enable Credit Monitoring →'}
            </button>
          </div>
        ) : (
          <>
            {/* ── Pending / status banner ── */}
            {status.enrollment?.status === 'pending' && (
              <div className="mb-6 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-800 dark:text-amber-300 text-sm">
                {status.guidance ||
                  'Your consent is recorded. Monitoring activates once your credit-monitoring membership is confirmed for this email.'}
              </div>
            )}

            {/* ── Score card ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-6">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Credit Score</div>
                <div className="text-4xl font-black text-black dark:text-white">
                  {latest?.score ?? '—'}
                </div>
                {scoreDelta !== null && scoreDelta !== 0 && (
                  <div className={`text-sm font-bold mt-1 ${scoreDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {scoreDelta > 0 ? '▲' : '▼'} {Math.abs(scoreDelta)} pts since last pull
                  </div>
                )}
                {latest?.scoreModel && (
                  <div className="text-xs text-zinc-400 mt-1">{latest.scoreModel}</div>
                )}
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-6">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Bureau</div>
                <div className="text-2xl font-black text-black dark:text-white capitalize">
                  {latest?.bureau ?? '—'}
                </div>
                <div className="text-xs text-zinc-400 mt-2">
                  {latest?.pulledAt
                    ? `Updated ${new Date(latest.pulledAt).toLocaleDateString()}`
                    : 'No report pulled yet'}
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Monitoring</div>
                  <div className="text-2xl font-black text-black dark:text-white capitalize">
                    {status.enrollment?.status}
                  </div>
                  <div className="text-xs text-zinc-400 mt-2">
                    Refreshes about every {status.refreshIntervalDays ?? 7} days
                  </div>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing || status.enrollment?.status !== 'active'}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-40"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh Now'}
                </button>
              </div>
            </div>

            {/* ── Alerts feed ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-black dark:text-white">
                  Alerts
                  {(status.unreadAlerts ?? 0) > 0 && (
                    <span className="ml-2 text-xs font-bold text-white bg-red-600 px-2 py-0.5 rounded-full">
                      {status.unreadAlerts} new
                    </span>
                  )}
                </h2>
                {alerts.length > 10 && (
                  <button
                    onClick={() => setShowAllAlerts(!showAllAlerts)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showAllAlerts ? 'Show less' : `Show all ${alerts.length}`}
                  </button>
                )}
              </div>
              {visibleAlerts.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No alerts yet — we'll flag changes here after each report pull.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {visibleAlerts.map((alert) => (
                    <li key={alert.id} className="py-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info}`}>
                            {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                          </span>
                          {!alert.readAt && (
                            <span className="w-2 h-2 rounded-full bg-blue-600" aria-label="unread" />
                          )}
                        </div>
                        <p className={`text-sm mt-1 ${alert.readAt ? 'text-zinc-500 dark:text-zinc-400' : 'text-black dark:text-white font-medium'}`}>
                          {alert.payload?.summary ?? 'Something changed on your credit report.'}
                        </p>
                        <time className="text-xs text-zinc-400" dateTime={alert.createdAt}>
                          {new Date(alert.createdAt).toLocaleString()}
                        </time>
                      </div>
                      {!alert.readAt && (
                        <button
                          onClick={() => handleMarkRead(alert.id)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                        >
                          Mark read
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Tradelines ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-6 mb-8">
              <h2 className="text-lg font-bold text-black dark:text-white mb-4">
                Accounts on Your Report ({latest?.tradelineCount ?? latest?.tradelines?.length ?? 0})
              </h2>
              {!latest || latest.tradelines.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No tradelines on the latest report.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-400 uppercase tracking-wide border-b border-zinc-100 dark:border-zinc-800">
                        <th className="pb-2 pr-4">Creditor</th>
                        <th className="pb-2 pr-4">Type</th>
                        <th className="pb-2 pr-4 text-right">Balance</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Last Reported</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {latest.tradelines.map((t, i) => (
                        <tr key={i}>
                          <td className="py-2.5 pr-4 font-medium text-black dark:text-white">
                            {t.creditorName ?? '—'}
                            {t.isCollection && (
                              <span className="ml-2 text-xs font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950 px-2 py-0.5 rounded-full">
                                Collection
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-zinc-500 dark:text-zinc-400">{t.accountType ?? '—'}</td>
                          <td className="py-2.5 pr-4 text-right text-black dark:text-white">
                            {t.balance != null ? `$${Number(t.balance).toLocaleString()}` : '—'}
                          </td>
                          <td className="py-2.5 pr-4 text-zinc-500 dark:text-zinc-400">{t.status ?? '—'}</td>
                          <td className="py-2.5 text-zinc-500 dark:text-zinc-400">
                            {t.lastReported ? new Date(t.lastReported).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Score history ── */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-6">
              <h2 className="text-lg font-bold text-black dark:text-white mb-4">Report History</h2>
              {snapshots.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No reports pulled yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {snapshots.map((s, i) => {
                    const prev = snapshots[i + 1];
                    const delta = s.score != null && prev?.score != null ? s.score - prev.score : null;
                    return (
                      <li key={s.id} className="py-3 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-bold text-black dark:text-white">
                            {s.score ?? '—'}
                            {delta !== null && delta !== 0 && (
                              <span className={`ml-2 text-xs ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {s.tradelineCount} tradelines{s.bureau ? ` · ${s.bureau}` : ''}
                          </div>
                        </div>
                        <time className="text-xs text-zinc-400" dateTime={s.pulledAt}>
                          {new Date(s.pulledAt).toLocaleDateString()}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="text-xs text-zinc-400 mt-6 max-w-2xl">
              Credit monitoring shows information from your credit report and alerts you to changes.
              It does not change your score, dispute items, or guarantee any outcome. Scores shown
              come from your bureau report and may differ from scores used by lenders.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
