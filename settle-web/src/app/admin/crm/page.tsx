'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';

import { API_URL } from '@/lib/apiUrl';
type Tab = 'pipeline' | 'leads' | 'clients';

interface CrmLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  source?: string;
  status: string;
  grade?: string;
  estimatedValue?: number;
  assignedTo?: string;
  lastContactedAt?: string;
  createdAt: string;
}

interface CrmClient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  lifecycleStage?: string;
  totalValue?: number;
  lastContact?: string;
  nextFollowUp?: string;
}

interface CrmDeal {
  id: string;
  title: string;
  stage: string;
  status: string;
  value: number;
  probability: number;
  expectedCloseDate?: string;
}

const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'nurturing',
  'closed_won',
  'closed_lost',
];

const LEAD_SOURCES = [
  'website',
  'social',
  'referral',
  'advertising',
  'cold_outreach',
  'event',
  'assessment',
  'provider_signup',
];

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contacted: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  qualified: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  proposal: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  negotiation: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  nurturing: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  closed_won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  closed_lost: 'bg-red-500/15 text-red-400 border-red-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  lost: 'bg-red-500/15 text-red-400 border-red-500/30',
  on_hold: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const FUNNEL_DOTS: Record<string, string> = {
  new: 'bg-blue-500',
  contacted: 'bg-cyan-500',
  qualified: 'bg-violet-500',
  proposal: 'bg-amber-500',
  negotiation: 'bg-orange-500',
  nurturing: 'bg-teal-500',
  closed_won: 'bg-emerald-500',
  closed_lost: 'bg-red-500',
};

function Badge({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize tracking-wide ${
        STATUS_COLORS[status] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
      }`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function Avatar({ first, last }: { first?: string; last?: string }) {
  const initials = `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300 border border-zinc-700">
      {initials}
    </span>
  );
}

export default function AdminCrmPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('pipeline');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (!token || !user) {
      router.push('/login');
      return;
    }
    const parsed = typeof user === 'string' ? JSON.parse(user) : user;
    if (parsed.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setReady(true);
  }, [router]);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getStoredToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${API_URL}/crm${path}`, {
        ...init,
        headers: { ...authHeaders(), ...(init?.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
      return data;
    },
    [authHeaders]
  );

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    clearMessages();
    try {
      const [p, d] = await Promise.all([api('/pipeline'), api('/deals')]);
      setPipeline(p || {});
      setDeals(Array.isArray(d) ? d : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    clearMessages();
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const data = await api(`/leads${qs}`);
      setLeads(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    clearMessages();
    try {
      const data = await api('/clients');
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (tab === 'pipeline') loadPipeline();
    if (tab === 'leads') loadLeads();
    if (tab === 'clients') loadClients();
  }, [ready, tab, loadPipeline, loadLeads, loadClients]);

  useEffect(() => {
    if (!ready || tab !== 'leads') return;
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const leadAction = async (id: string, action: 'advance' | 'lose' | 'nurture' | 'promote') => {
    setBusy(id + action);
    clearMessages();
    try {
      await api(`/leads/${id}/${action}`, {
        method: 'POST',
        body: action === 'lose' ? JSON.stringify({ reason: 'Marked lost from CRM' }) : undefined,
      });
      setSuccess(
        action === 'promote' ? 'Lead promoted to client.' : `Lead ${action}d.`
      );
      await loadLeads();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy('form');
    clearMessages();
    try {
      await api('/leads', {
        method: 'POST',
        body: JSON.stringify({
          firstName: f.get('firstName'),
          lastName: f.get('lastName'),
          email: f.get('email'),
          phone: f.get('phone') || undefined,
          company: f.get('company') || undefined,
          source: f.get('source') || 'website',
        }),
      });
      setShowLeadForm(false);
      setSuccess('Lead created.');
      await loadLeads();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const money = (n?: number) => (n == null ? '—' : `$${Number(n).toLocaleString()}`);

  const openDeals = deals.filter((d) => d.status === 'active');
  const openValue = openDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const wonCount = pipeline['closed_won'] ?? 0;
  const totalInPipeline = LEAD_STATUSES.reduce((s, k) => s + (pipeline[k] ?? 0), 0);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold tracking-tight">CRM Center</h1>
              <Badge status={tab === 'pipeline' ? 'active' : undefined} />
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Settlement leads, clients, and the deal pipeline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLeadForm(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              + New Lead
            </button>
            <Link
              href="/admin"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
            >
              ← Admin
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex gap-1">
            {(
              [
                ['pipeline', 'Pipeline', totalInPipeline],
                ['leads', 'Leads', leads.length || null],
                ['clients', 'Clients', clients.length || null],
              ] as [Tab, string, number | null][]
            ).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative px-4 pb-3 pt-1 text-sm font-medium transition ${
                  tab === key ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
                {count != null && count > 0 && (
                  <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                    {count}
                  </span>
                )}
                {tab === key && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-emerald-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {(error || success) && (
          <div
            className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
              error
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}
          >
            {error || success}
          </div>
        )}
        {loading && <p className="text-sm text-zinc-500">Loading…</p>}

        {/* ===================== PIPELINE ===================== */}
        {tab === 'pipeline' && !loading && (
          <div className="space-y-6">
            {/* Funnel strip */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex items-end justify-between gap-1">
                {LEAD_STATUSES.map((s) => {
                  const n = pipeline[s] ?? 0;
                  const max = Math.max(1, ...LEAD_STATUSES.map((k) => pipeline[k] ?? 0));
                  return (
                    <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <span className="text-lg font-bold tabular-nums text-zinc-100">{n}</span>
                      <div className="h-16 w-full max-w-[28px] rounded-sm bg-zinc-800/60 relative overflow-hidden">
                        <div
                          className={`absolute bottom-0 left-0 right-0 ${FUNNEL_DOTS[s]} transition-all`}
                          style={{ height: `${Math.max(4, (n / max) * 100)}%` }}
                        />
                      </div>
                      <span className="text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500 leading-tight">
                        {s.replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Open pipeline</p>
                <p className="mt-1.5 text-2xl font-bold text-zinc-50">{money(openValue)}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Active deals</p>
                <p className="mt-1.5 text-2xl font-bold text-zinc-50">{openDeals.length}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Closed won</p>
                <p className="mt-1.5 text-2xl font-bold text-emerald-400">{wonCount}</p>
              </div>
            </div>

            {/* Deals table */}
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="border-b border-zinc-800 px-5 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Open deals</h2>
              </div>
              {openDeals.length > 0 ? (
                <div className="divide-y divide-zinc-800/60">
                  {openDeals.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{d.title}</p>
                        <p className="mt-0.5 text-xs capitalize text-zinc-500">
                          {d.stage.replace(/_/g, ' ')} · {d.probability}% likely
                        </p>
                      </div>
                      <span className="ml-4 shrink-0 text-sm font-semibold tabular-nums text-zinc-100">
                        {money(d.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-medium text-zinc-400">No active deals</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Deals appear here when leads reach the proposal stage.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== LEADS ===================== */}
        {tab === 'leads' && !loading && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                {leads.length} lead{leads.length === 1 ? '' : 's'}
                {statusFilter ? ` · ${statusFilter.replace(/_/g, ' ')}` : ''}
              </p>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 outline-none focus:border-emerald-600"
              >
                <option value="">All statuses</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {leads.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
                <div className="divide-y divide-zinc-800/60">
                  {leads.map((l) => (
                    <div key={l.id} className="flex items-center gap-4 px-5 py-3.5">
                      <Avatar first={l.firstName} last={l.lastName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">
                            {l.firstName} {l.lastName}
                          </span>
                          <Badge status={l.status} />
                          {l.grade && (
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">
                              {l.grade}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {l.email}
                          {l.source ? ` · ${l.source.replace(/_/g, ' ')}` : ''}
                          {l.estimatedValue ? ` · ${money(l.estimatedValue)}` : ''}
                        </p>
                      </div>
                      {!['closed_won', 'closed_lost'].includes(l.status) && (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => leadAction(l.id, 'advance')}
                            disabled={busy === l.id + 'advance'}
                            className="rounded-md bg-emerald-600/90 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                          >
                            Advance
                          </button>
                          <button
                            onClick={() => leadAction(l.id, 'nurture')}
                            disabled={busy === l.id + 'nurture'}
                            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
                          >
                            Nurture
                          </button>
                          <button
                            onClick={() => leadAction(l.id, 'promote')}
                            disabled={busy === l.id + 'promote'}
                            className="rounded-md border border-teal-600/50 px-2.5 py-1.5 text-[11px] font-semibold text-teal-400 transition hover:bg-teal-500/10 disabled:opacity-40"
                          >
                            → Client
                          </button>
                          <button
                            onClick={() => leadAction(l.id, 'lose')}
                            disabled={busy === l.id + 'lose'}
                            className="rounded-md border border-red-600/40 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
                          >
                            Lose
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center">
                <p className="text-sm font-medium text-zinc-400">No leads match</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Leads from the assessment funnel and imports land here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===================== CLIENTS ===================== */}
        {tab === 'clients' && !loading && (
          <div>
            <p className="mb-4 text-sm text-zinc-500">
              {clients.length} client{clients.length === 1 ? '' : 's'}
            </p>
            {clients.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
                <div className="divide-y divide-zinc-800/60">
                  {clients.map((c) => (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                      <Avatar first={c.firstName} last={c.lastName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">
                            {c.firstName} {c.lastName}
                          </span>
                          <Badge status={c.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {c.email}
                          {c.lifecycleStage ? ` · ${c.lifecycleStage.replace(/_/g, ' ')}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-100">
                        {money(c.totalValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center">
                <p className="text-sm font-medium text-zinc-400">No clients yet</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Promote a qualified lead to start building the client book.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lead form modal */}
      {showLeadForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowLeadForm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-50">New lead</h2>
              <button
                onClick={() => setShowLeadForm(false)}
                className="text-zinc-500 transition hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <form onSubmit={createLead} className="space-y-3">
              {[
                ['firstName', 'First name', 'text', true],
                ['lastName', 'Last name', 'text', true],
                ['email', 'Email', 'email', true],
                ['phone', 'Phone', 'text', false],
                ['company', 'Company', 'text', false],
              ].map(([name, label, type, req]) => (
                <label key={name as string} className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
                  <input
                    name={name as string}
                    type={type as string}
                    required={req as boolean}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-600"
                  />
                </label>
              ))}
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-400">Source</span>
                <select
                  name="source"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600"
                >
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy === 'form'}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === 'form' ? 'Saving…' : 'Add lead'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
