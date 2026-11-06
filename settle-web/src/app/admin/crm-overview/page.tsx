'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';
import { API_URL } from '@/lib/apiUrl';

interface LeadRow {
  id: string;
  name: string;
  email: string;
  state?: string;
  status: string;
  totalDebt?: number | null;
  qualityScore?: number;
  mlTier?: string;
  source?: string;
  createdAt?: string;
}

interface ProviderRow {
  id: string;
  companyName: string;
  email?: string;
  status: string;
  city?: string;
  statesServed?: string[];
  serviceTypes?: string[];
  createdAt?: string;
}

interface CrmOverview {
  leads: {
    total: number;
    byStatus: Record<string, number>;
    conversionRate?: number;
    recent: LeadRow[];
  };
  assessments: { total: number; note?: string };
  providers: {
    total: number;
    byStatus: Record<string, number>;
    pending: number;
    recent: ProviderRow[];
  };
  closeFlow: {
    orders: number;
    revenueCents: number;
    revenue: number;
    byStatus: Record<string, number>;
    recentOrders: {
      id: string;
      email?: string;
      name?: string;
      offer?: string;
      amount: number;
      paidAt?: string;
    }[];
  };
  users: { total: number };
  matches: { total: number };
  generatedAt: string;
}

const fmtMoney = (n?: number | null) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '—');

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function StatusChips({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="text-sm text-zinc-500">No records yet</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-300"
        >
          {k.replace(/_/g, ' ')} · <span className="font-semibold text-zinc-100">{v}</span>
        </span>
      ))}
    </div>
  );
}

export default function AdminCrmOverviewPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<CrmOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (!token || !user) {
      router.push('/login');
      return;
    }
    const parsed = typeof user === 'string' ? JSON.parse(user) : user;
    // Endpoint is SalesGuard-gated — admin OR sales staff tier.
    if (parsed.role !== 'admin' && parsed.role !== 'sales') {
      router.push('/dashboard');
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const token = getStoredToken();
    fetch(`${API_URL}/admin/crm`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">CRM Overview</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Leads, assessments, providers, and close-flow revenue in one snapshot.
            {data?.generatedAt && (
              <span className="ml-2 text-zinc-600">
                generated {new Date(data.generatedAt).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/admin/crm"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
        >
          Open CRM Center →
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error} — this view needs an admin or sales account and a healthy API.
        </div>
      )}

      {!data && !error && <p className="text-sm text-zinc-500">Loading CRM overview…</p>}

      {data && (
        <div className="space-y-8">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Leads" value={data.leads.total} sub={`${data.leads.conversionRate ?? 0}% sold→converted`} />
            <Stat label="Assessments" value={data.assessments.total} sub="TCPA-consented quiz submits" />
            <Stat label="Providers" value={data.providers.total} sub={`${data.providers.pending} awaiting approval`} />
            <Stat label="Close-flow orders" value={data.closeFlow.orders} sub="paid sequences" />
            <Stat label="Close-flow revenue" value={fmtMoney(data.closeFlow.revenue)} sub="priority-match fees" />
            <Stat label="Users / Matches" value={`${data.users.total} / ${data.matches.total}`} />
          </div>

          {/* Status breakdowns */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold text-zinc-200">Leads by status</h2>
              <StatusChips data={data.leads.byStatus} />
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold text-zinc-200">Providers by status</h2>
              <StatusChips data={data.providers.byStatus} />
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold text-zinc-200">Close-flow by status</h2>
              <StatusChips data={data.closeFlow.byStatus} />
            </div>
          </div>

          {/* Recent paid orders */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">Recent close-flow orders (paid)</h2>
            {data.closeFlow.recentOrders.length === 0 ? (
              <p className="text-sm text-zinc-500">No paid orders yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">Offer</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.closeFlow.recentOrders.map((o) => (
                      <tr key={o.id} className="border-b border-zinc-800/60 text-zinc-300">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-zinc-100">{o.name || o.email || '—'}</div>
                          {o.name && o.email && <div className="text-xs text-zinc-500">{o.email}</div>}
                        </td>
                        <td className="py-2 pr-4 text-zinc-400">{o.offer || 'priority-match'}</td>
                        <td className="py-2 pr-4 font-semibold text-emerald-400">{fmtMoney(o.amount)}</td>
                        <td className="py-2 text-zinc-500">{fmtDate(o.paidAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent leads + providers */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold text-zinc-200">Recent leads</h2>
              {data.leads.recent.length === 0 ? (
                <p className="text-sm text-zinc-500">No leads yet</p>
              ) : (
                <div className="space-y-2">
                  {data.leads.recent.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-100">{l.name}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {l.email} · {l.state || '—'} · {fmtMoney(l.totalDebt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                          {l.status}
                        </span>
                        <p className="mt-0.5 text-[11px] text-zinc-600">
                          score {l.qualityScore ?? '—'}{l.mlTier ? ` · ${l.mlTier}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold text-zinc-200">Recent providers</h2>
              {data.providers.recent.length === 0 ? (
                <p className="text-sm text-zinc-500">No providers yet</p>
              ) : (
                <div className="space-y-2">
                  {data.providers.recent.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-100">{p.companyName}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {p.city || '—'} · {(p.statesServed ?? []).slice(0, 4).join(' ') || '—'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
