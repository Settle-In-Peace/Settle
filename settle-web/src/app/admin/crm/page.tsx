'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

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
  new: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
  contacted: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400',
  qualified: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400',
  proposal: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
  negotiation: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400',
  nurturing: 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-400',
  closed_won: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  closed_lost: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400',
  active: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  won: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  lost: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400',
  on_hold: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
};

function Badge({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <span
      className={`text-xs font-bold px-2 py-1 rounded-full ${
        STATUS_COLORS[status] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
      }`}
    >
      {status.replace(/_/g, ' ')}
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

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-50">CRM</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Settlement leads, clients, and the deal pipeline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLeadForm(true)}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
            >
              + Lead
            </button>
            <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200">
              ← Admin
            </Link>
          </div>
        </div>

        <div className="mt-8 flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {(
            [
              ['pipeline', 'Pipeline'],
              ['leads', 'Leads'],
              ['clients', 'Clients'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === key
                  ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            {success}
          </div>
        )}
        {loading && <p className="mt-6 text-sm text-zinc-500">Loading…</p>}

        {tab === 'pipeline' && !loading && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LEAD_STATUSES.slice(0, 8).map((s) => (
                <div
                  key={s}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {s.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    {pipeline[s] ?? 0}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Open deals
              </h2>
              <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                {deals
                  .filter((d) => d.status === 'active')
                  .map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{d.title}</span>
                        <span className="ml-2 text-xs text-zinc-500">
                          {d.stage.replace(/_/g, ' ')} · {d.probability}%
                        </span>
                      </div>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {money(d.value)}
                      </span>
                    </div>
                  ))}
                {deals.filter((d) => d.status === 'active').length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-zinc-500">No active deals.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'leads' && !loading && (
          <div className="mt-6">
            <div className="mb-4 flex gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">All statuses</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              {leads.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {l.firstName} {l.lastName}
                      </span>
                      <Badge status={l.status} />
                      {l.grade && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {l.grade}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {l.email} {l.source ? `· ${l.source.replace(/_/g, ' ')}` : ''}
                      {l.estimatedValue ? ` · ${money(l.estimatedValue)}` : ''}
                    </p>
                  </div>
                  {!['closed_won', 'closed_lost'].includes(l.status) && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => leadAction(l.id, 'advance')}
                        disabled={busy === l.id + 'advance'}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                      >
                        Advance
                      </button>
                      <button
                        onClick={() => leadAction(l.id, 'nurture')}
                        disabled={busy === l.id + 'nurture'}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Nurture
                      </button>
                      <button
                        onClick={() => leadAction(l.id, 'promote')}
                        disabled={busy === l.id + 'promote'}
                        className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      >
                        → Client
                      </button>
                      <button
                        onClick={() => leadAction(l.id, 'lose')}
                        disabled={busy === l.id + 'lose'}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950"
                      >
                        Lose
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {leads.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-500">No leads match.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'clients' && !loading && (
          <div className="mt-6 space-y-3">
            {clients.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {c.firstName} {c.lastName}
                    </span>
                    <Badge status={c.status} />
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {c.email} {c.lifecycleStage ? `· ${c.lifecycleStage.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {money(c.totalValue)}
                </span>
              </div>
            ))}
            {clients.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-500">
                No clients yet — promote a qualified lead.
              </p>
            )}
          </div>
        )}
      </main>

      {showLeadForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowLeadForm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Add lead</h2>
              <button onClick={() => setShowLeadForm(false)} className="text-zinc-400 hover:text-zinc-600">
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
                  <span className="mb-1 block text-zinc-600 dark:text-zinc-400">{label}</span>
                  <input
                    name={name as string}
                    type={type as string}
                    required={req as boolean}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                </label>
              ))}
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Source</span>
                <select
                  name="source"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
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
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
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
