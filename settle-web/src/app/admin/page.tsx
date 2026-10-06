'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearAuth, getStoredToken, getStoredUser } from '@/lib/authUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

interface AdminProvider {
  id: string;
  companyName: string;
  email: string;
  status: string; // pending, active, suspended, inactive, rejected
  creditBalance: number;
  successfulSettlements: number;
  avgRating?: number;
  reviewCount: number;
  createdAt?: string;
}

interface AdminLead {
  id: string;
  firstName?: string;
  lastName?: string;
  state?: string;
  totalDebt: number;
  debtTypes?: string[];
  qualityScore?: number;
  status?: string; // available, sold, matched
  createdAt?: string;
}

interface AdminMatch {
  id: string;
  leadId?: string;
  providerId?: string;
  providerName?: string;
  leadName?: string;
  matchScore?: number;
  status?: string; // matched, requested, purchased, declined
  createdAt?: string;
}

interface LeadStats {
  total?: number;
  available?: number;
  sold?: number;
  conversionRate?: number;
}

interface MatchStats {
  total?: number;
  requested?: number;
  purchased?: number;
  conversionRate?: number;
}

const DEBT_LABELS: Record<string, string> = {
  credit_card: 'Credit Cards', medical: 'Medical', personal_loan: 'Personal Loans',
  student_loan: 'Student Loans', business: 'Business', other: 'Other',
};

function getToken(): string | null {
  return getStoredToken();
}

function authHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400',
  active: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  suspended: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400',
  inactive: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  rejected: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400',
  available: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
  sold: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  matched: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400',
  requested: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
  purchased: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400',
  declined: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_COLORS[status] || 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
      {status}
    </span>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'providers' | 'leads' | 'matches' | 'transactions'>('providers');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Providers
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [pendingProviders, setPendingProviders] = useState<AdminProvider[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [creditModal, setCreditModal] = useState<AdminProvider | null>(null);
  const [creditAmount, setCreditAmount] = useState('');

  // Leads
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [assignModal, setAssignModal] = useState<AdminLead | null>(null);

  // Matches
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);

  // Transactions (deposits)
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depositFilter, setDepositFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [depositLoading, setDepositLoading] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const parsed = getStoredUser();
    if (!token || !parsed) {
      router.push('/login');
      return;
    }
    if (parsed.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setUser(parsed);
    loadAll(token);
  }, []);

  const loadAll = async (token: string) => {
    const headers = authHeaders(token);
    try {
      const [providersRes, pendingRes, leadsRes, leadStatsRes] = await Promise.all([
        fetch(`${API_URL}/admin/providers`, { headers }).catch(() => null),
        fetch(`${API_URL}/admin/providers/pending`, { headers }).catch(() => null),
        fetch(`${API_URL}/admin/leads`, { headers }).catch(() => null),
        fetch(`${API_URL}/admin/leads/stats`, { headers }).catch(() => null),
      ]);
      if (providersRes?.ok) setProviders(await providersRes.json());
      if (pendingRes?.ok) setPendingProviders(await pendingRes.json());
      if (leadsRes?.ok) {
        const data = await leadsRes.json();
        setLeads(Array.isArray(data) ? data : data?.leads ?? []);
      }
      if (leadStatsRes?.ok) setLeadStats(await leadStatsRes.json());

      // Matches + match stats
      const [matchesRes, matchStatsRes] = await Promise.all([
        fetch(`${API_URL}/admin/matches`, { headers }).catch(() => null),
        fetch(`${API_URL}/matching/stats`, { headers }).catch(() => null),
      ]);
      if (matchesRes?.ok) {
        const data = await matchesRes.json();
        setMatches(Array.isArray(data) ? data : data?.matches ?? []);
      }
      if (matchStatsRes?.ok) setMatchStats(await matchStatsRes.json());
    } catch {
      setError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'transactions') {
      fetchDeposits();
    }
  }, [activeTab, depositFilter]);

  const fetchDeposits = async (status = depositFilter) => {
    const token = getToken();
    if (!token) return;
    setDepositLoading(true);
    try {
      const query = status === 'all' ? '' : `?status=${status}`;
      const res = await fetch(`${API_URL}/billing/admin/deposits${query}`, {
        headers: authHeaders(token),
      });
      if (res.ok) setDeposits(await res.json());
    } catch {
      setError('Failed to load deposits');
    } finally {
      setDepositLoading(false);
    }
  };

  const approveDeposit = async (id: string) => {
    const token = getToken();
    if (!token) return;
    setActionLoading(`deposit-approve-${id}`);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/billing/admin/deposits/${id}/approve`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to approve deposit');
      setSuccessMsg('Deposit approved and credited.');
      await fetchDeposits();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const rejectDeposit = async (id: string) => {
    const token = getToken();
    if (!token) return;
    setActionLoading(`deposit-reject-${id}`);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/billing/admin/deposits/${id}/reject`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Could not verify deposit' }),
      });
      if (!res.ok) throw new Error('Failed to reject deposit');
      setSuccessMsg('Deposit rejected.');
      await fetchDeposits();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const providerAction = async (id: string, action: 'approve' | 'reject' | 'suspend') => {
    const token = getToken();
    if (!token) return;
    setActionLoading(`${id}-${action}`);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/providers/${id}/${action}`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: action === 'reject' ? JSON.stringify({ reason: 'Did not meet requirements' }) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to ${action} provider`);
      }
      setSuccessMsg(`Provider ${action}d successfully.`);
      await loadAll(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const adjustCredits = async () => {
    if (!creditModal) return;
    const token = getToken();
    if (!token) return;
    const amount = parseFloat(creditAmount);
    if (isNaN(amount)) {
      setError('Enter a valid credit amount');
      return;
    }
    setActionLoading(`credit-${creditModal.id}`);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/providers/${creditModal.id}/adjust-credits`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to adjust credits');
      }
      setSuccessMsg('Credits adjusted successfully.');
      setCreditModal(null);
      setCreditAmount('');
      await loadAll(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const assignLead = async (leadId: string, providerId: string) => {
    const token = getToken();
    if (!token || !providerId) return;
    setActionLoading(`assign-${leadId}`);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/leads/${leadId}/manual-assign`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to assign lead');
      }
      setSuccessMsg('Lead assigned to provider.');
      setAssignModal(null);
      await loadAll(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-zinc-500">Loading admin dashboard...</div>
        </div>
      </div>
    );
  }

  const soldLeads = leads.filter(l => l.status === 'sold').length;
  const availableLeads = leads.filter(l => l.status === 'available').length;
  const leadConversion = leadStats?.conversionRate ?? (leads.length > 0 ? Math.round((soldLeads / leads.length) * 100) : 0);

  const purchasedMatches = matches.filter(m => m.status === 'purchased').length;
  const requestedMatches = matches.filter(m => m.status === 'requested').length;
  const matchConversion = matchStats?.conversionRate ?? (matches.length > 0 ? Math.round((purchasedMatches / matches.length) * 100) : 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Top bar */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-bold text-black dark:text-white">
              Settle<span className="text-blue-600">InPeace</span>
            </Link>
            <span className="text-xs bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full font-medium">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/crm" className="text-sm text-blue-600 hover:underline">CRM</Link>
            <Link href="/admin/sales" className="text-sm text-blue-600 hover:underline">Sales CRM</Link>
            <span className="text-sm text-zinc-500 hidden sm:block">{user?.email}</span>
            <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-red-500">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-black dark:text-white mb-6">Admin Dashboard</h1>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm flex items-start justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-4 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="mb-6 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-green-700 dark:text-green-300 text-sm flex items-start justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="ml-4 text-green-400 hover:text-green-600">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { id: 'providers' as const, label: `Providers (${providers.length})` },
            { id: 'leads' as const, label: `Leads (${leads.length})` },
            { id: 'matches' as const, label: `Matches (${matches.length})` },
            { id: 'transactions' as const, label: `Transactions (${deposits.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Providers tab */}
        {activeTab === 'providers' && (
          <div className="space-y-8">
            {/* Pending providers */}
            <div>
              <h2 className="text-lg font-bold text-black dark:text-white mb-4">
                Pending Approval {pendingProviders.length > 0 && <span className="text-yellow-600">({pendingProviders.length})</span>}
              </h2>
              {pendingProviders.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-8 text-center text-zinc-500 text-sm">
                  No providers awaiting approval.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingProviders.map(p => (
                    <div key={p.id} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5 flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <div className="font-bold text-black dark:text-white">{p.companyName}</div>
                        <div className="text-sm text-zinc-500">{p.email}</div>
                        {p.createdAt && <div className="text-xs text-zinc-400 mt-1">Applied {new Date(p.createdAt).toLocaleDateString()}</div>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => providerAction(p.id, 'approve')}
                          disabled={actionLoading === `${p.id}-approve`}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === `${p.id}-approve` ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => providerAction(p.id, 'reject')}
                          disabled={actionLoading === `${p.id}-reject`}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading === `${p.id}-reject` ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All providers table */}
            <div>
              <h2 className="text-lg font-bold text-black dark:text-white mb-4">All Providers</h2>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4">Company</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-right p-4">Credits</th>
                      <th className="text-right p-4">Settlements</th>
                      <th className="text-right p-4">Rating</th>
                      <th className="text-right p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-zinc-500">No providers yet.</td></tr>
                    ) : providers.map(p => (
                      <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="p-4">
                          <div className="font-semibold text-black dark:text-white">{p.companyName}</div>
                          <div className="text-xs text-zinc-400">{p.email}</div>
                        </td>
                        <td className="p-4"><StatusBadge status={p.status} /></td>
                        <td className="p-4 text-right font-bold text-green-600">${p.creditBalance}</td>
                        <td className="p-4 text-right text-black dark:text-white">{p.successfulSettlements}</td>
                        <td className="p-4 text-right text-black dark:text-white">{p.avgRating ? `${p.avgRating}★` : '—'}</td>
                        <td className="p-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setCreditModal(p); setCreditAmount(''); }}
                              className="px-3 py-1.5 text-xs font-bold border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950"
                            >
                              Adjust Credits
                            </button>
                            {p.status === 'active' && (
                              <button
                                onClick={() => providerAction(p.id, 'suspend')}
                                disabled={actionLoading === `${p.id}-suspend`}
                                className="px-3 py-1.5 text-xs font-bold border border-red-600 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                              >
                                {actionLoading === `${p.id}-suspend` ? '...' : 'Suspend'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Leads tab */}
        {activeTab === 'leads' && (
          <div className="space-y-8">
            {/* Lead statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Total Leads</div>
                <div className="text-2xl font-black text-black dark:text-white">{leadStats?.total ?? leads.length}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Available</div>
                <div className="text-2xl font-black text-blue-600">{leadStats?.available ?? availableLeads}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Sold</div>
                <div className="text-2xl font-black text-green-600">{leadStats?.sold ?? soldLeads}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Conversion Rate</div>
                <div className="text-2xl font-black text-purple-600">{leadConversion}%</div>
              </div>
            </div>

            {/* All leads table */}
            <div>
              <h2 className="text-lg font-bold text-black dark:text-white mb-4">All Leads</h2>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4">Lead</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-right p-4">Quality</th>
                      <th className="text-right p-4">Debt Amount</th>
                      <th className="text-left p-4">State</th>
                      <th className="text-left p-4">Debt Types</th>
                      <th className="text-right p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-zinc-500">No leads yet.</td></tr>
                    ) : leads.map(l => (
                      <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="p-4">
                          <div className="font-semibold text-black dark:text-white">
                            {l.firstName || l.lastName ? `${l.firstName || ''} ${l.lastName || ''}`.trim() : 'Anonymous'}
                          </div>
                          {l.createdAt && <div className="text-xs text-zinc-400">{new Date(l.createdAt).toLocaleDateString()}</div>}
                        </td>
                        <td className="p-4"><StatusBadge status={l.status} /></td>
                        <td className="p-4 text-right">
                          {typeof l.qualityScore === 'number' ? (
                            <span className="font-bold" style={{ color: l.qualityScore >= 70 ? '#16a34a' : l.qualityScore >= 40 ? '#2563eb' : '#a1a1aa' }}>
                              {l.qualityScore}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-4 text-right font-bold text-black dark:text-white">${Number(l.totalDebt).toLocaleString()}</td>
                        <td className="p-4 text-black dark:text-white">{l.state || '—'}</td>
                        <td className="p-4 text-xs text-zinc-600 dark:text-zinc-400">
                          {l.debtTypes?.map(t => DEBT_LABELS[t] || t).join(', ') || '—'}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => setAssignModal(l)}
                            className="px-3 py-1.5 text-xs font-bold border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950"
                          >
                            Assign
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Matches tab */}
        {activeTab === 'matches' && (
          <div className="space-y-8">
            {/* Match statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Total Matches</div>
                <div className="text-2xl font-black text-black dark:text-white">{matchStats?.total ?? matches.length}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Requested</div>
                <div className="text-2xl font-black text-blue-600">{matchStats?.requested ?? requestedMatches}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Purchased</div>
                <div className="text-2xl font-black text-green-600">{matchStats?.purchased ?? purchasedMatches}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
                <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Conversion Rate</div>
                <div className="text-2xl font-black text-purple-600">{matchConversion}%</div>
              </div>
            </div>

            {/* Recent matches table */}
            <div>
              <h2 className="text-lg font-bold text-black dark:text-white mb-4">Recent Matches</h2>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4">Lead</th>
                      <th className="text-left p-4">Provider</th>
                      <th className="text-right p-4">Match Score</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-left p-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-zinc-500">No matches yet.</td></tr>
                    ) : matches.map(m => (
                      <tr key={m.id} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="p-4 font-semibold text-black dark:text-white">{m.leadName || m.leadId?.slice(0, 8) || '—'}</td>
                        <td className="p-4 text-black dark:text-white">{m.providerName || m.providerId?.slice(0, 8) || '—'}</td>
                        <td className="p-4 text-right">
                          {typeof m.matchScore === 'number' ? (
                            <span className="font-bold text-green-600">{m.matchScore}%</span>
                          ) : '—'}
                        </td>
                        <td className="p-4"><StatusBadge status={m.status} /></td>
                        <td className="p-4 text-zinc-500">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Transactions tab */}
        {activeTab === 'transactions' && (
          <div className="space-y-8">
            <div className="flex flex-wrap gap-2">
              {(['all', 'pending', 'approved', 'rejected'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setDepositFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    depositFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            {depositLoading ? (
              <div className="text-center py-20 text-zinc-500">Loading transactions...</div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4">Provider</th>
                      <th className="text-right p-4">Amount</th>
                      <th className="text-left p-4">Method</th>
                      <th className="text-left p-4">Reference</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-left p-4">Date</th>
                      <th className="text-right p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-zinc-500">No transactions found.</td></tr>
                    ) : deposits.map(d => (
                      <tr key={d.id} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="p-4 font-semibold text-black dark:text-white">{d.providerId ? d.providerId.slice(0, 8) : 'Unmatched'}</td>
                        <td className="p-4 text-right font-bold text-black dark:text-white">${Number(d.amount).toLocaleString()}</td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-400">{d.method}</td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-400">{d.reference || '—'}</td>
                        <td className="p-4"><StatusBadge status={d.status} /></td>
                        <td className="p-4 text-zinc-500">{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}</td>
                        <td className="p-4 text-right">
                          {d.status === 'pending' && (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => approveDeposit(d.id)}
                                disabled={actionLoading === `deposit-approve-${d.id}`}
                                className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                              >
                                {actionLoading === `deposit-approve-${d.id}` ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => rejectDeposit(d.id)}
                                disabled={actionLoading === `deposit-reject-${d.id}`}
                                className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                              >
                                {actionLoading === `deposit-reject-${d.id}` ? '...' : 'Reject'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Adjust Credits Modal */}
      {creditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCreditModal(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-black dark:text-white mb-1">Adjust Credits</h3>
            <p className="text-sm text-zinc-500 mb-4">{creditModal.companyName}</p>
            <p className="text-xs text-zinc-400 mb-4">Current balance: <span className="font-bold text-green-600">${creditModal.creditBalance}</span></p>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Amount (use negative to deduct)</label>
            <input
              type="number"
              value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)}
              placeholder="e.g. 500 or -200"
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCreditModal(null)} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
              <button
                onClick={adjustCredits}
                disabled={actionLoading === `credit-${creditModal.id}`}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading === `credit-${creditModal.id}` ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Lead Modal */}
      {assignModal && (
        <AssignLeadModal
          lead={assignModal}
          providers={providers}
          onAssign={assignLead}
          onClose={() => setAssignModal(null)}
          loading={actionLoading === `assign-${assignModal.id}`}
        />
      )}
    </div>
  );
}

function AssignLeadModal({
  lead,
  providers,
  onAssign,
  onClose,
  loading,
}: {
  lead: AdminLead;
  providers: AdminProvider[];
  onAssign: (leadId: string, providerId: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [selectedProvider, setSelectedProvider] = useState('');
  const activeProviders = providers.filter(p => p.status === 'active');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-black dark:text-white mb-1">Assign Lead to Provider</h3>
        <p className="text-sm text-zinc-500 mb-4">
          ${Number(lead.totalDebt).toLocaleString()} · {lead.state || '—'}
        </p>
        {activeProviders.length === 0 ? (
          <p className="text-sm text-zinc-500 mb-4">No active providers available to assign.</p>
        ) : (
          <>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Select Provider</label>
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a provider...</option>
              {activeProviders.map(p => (
                <option key={p.id} value={p.id}>{p.companyName} (${p.creditBalance} credits)</option>
              ))}
            </select>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
          <button
            onClick={() => onAssign(lead.id, selectedProvider)}
            disabled={loading || !selectedProvider}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Assigning...' : 'Assign Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
