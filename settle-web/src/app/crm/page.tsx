'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedApi } from '@/lib/api';
import { getStoredUser, isAuthenticated } from '@/lib/authUtils';

type CrmLead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  source: string;
  status: string;
  score: number;
  aiScore?: number;
  aiGrade?: string;
  aiInsights?: string[];
  aiRecommendedActions?: string[];
  createdAt: string;
  updatedAt: string;
};

type CrmDeal = {
  id: string;
  title: string;
  value: number;
  stage: string;
  status: string;
  probability: number;
  createdAt: string;
};

type CrmClient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  lifecycleStage: string;
  createdAt: string;
};

type CrmDashboard = {
  leads: CrmLead[];
  clients: CrmClient[];
  sales: CrmDeal[];
  pipeline: Record<string, number>;
};

type LeadStats = {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  proposal: number;
  negotiation: number;
  closedWon: number;
  closedLost: number;
  nurturing: number;
};

const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
  'nurturing',
] as const;

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  contacted: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  qualified: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  proposal: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  negotiation: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  closed_won: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  closed_lost: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  nurturing: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const DEAL_STAGES = [
  'prospecting',
  'qualification',
  'proposal',
  'negotiation',
  'purchase',
  'closed_won',
  'closed_lost',
];

const DEAL_STAGE_COLORS: Record<string, string> = {
  prospecting: 'bg-zinc-500',
  qualification: 'bg-blue-500',
  proposal: 'bg-indigo-500',
  negotiation: 'bg-orange-500',
  purchase: 'bg-emerald-500',
  closed_won: 'bg-green-500',
  closed_lost: 'bg-red-500',
};

const SOURCES = [
  { value: 'website', label: 'Website' },
  { value: 'social', label: 'Social' },
  { value: 'referral', label: 'Referral' },
  { value: 'advertising', label: 'Advertising' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'event', label: 'Event' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'provider_signup', label: 'Provider Signup' },
];

function formatCurrency(amount?: number) {
  if (amount === undefined || Number.isNaN(amount)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(date?: string) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CrmPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);
  const [data, setData] = useState<CrmDashboard | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [closedRevenue, setClosedRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'leads' | 'deals' | 'clients'>('leads');

  // Create lead modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newLead, setNewLead] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    jobTitle: '',
    source: 'assessment',
  });

  // Lead status filter for board view
  const [boardFilter, setBoardFilter] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    const stored = getStoredUser();
    // Staff login routes admin, lender, and referral_manager here
    if (!stored || !['admin', 'lender', 'referral_manager'].includes(stored.role)) {
      router.push('/dashboard');
      return;
    }
    setUser(stored);
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      const api = getAuthenticatedApi();
      const dashboard = await api<CrmDashboard>('/crm/dashboard', { method: 'GET' });
      setData(dashboard);

      // Lead stats
      const stats: LeadStats = {
        total: dashboard.leads.length,
        new: 0,
        contacted: 0,
        qualified: 0,
        proposal: 0,
        negotiation: 0,
        closedWon: 0,
        closedLost: 0,
        nurturing: 0,
      };
      for (const lead of dashboard.leads) {
        switch (lead.status) {
          case 'new': stats.new++; break;
          case 'contacted': stats.contacted++; break;
          case 'qualified': stats.qualified++; break;
          case 'proposal': stats.proposal++; break;
          case 'negotiation': stats.negotiation++; break;
          case 'closed_won': stats.closedWon++; break;
          case 'closed_lost': stats.closedLost++; break;
          case 'nurturing': stats.nurturing++; break;
        }
      }
      setLeadStats(stats);

      // Pipeline totals
      let pTotal = 0;
      for (const v of Object.values(dashboard.pipeline)) {
        pTotal += Number(v) || 0;
      }
      setPipelineTotal(pTotal);

      const revenue = dashboard.sales.reduce((sum, d) => sum + Number(d.value), 0);
      setClosedRevenue(revenue);
    } catch (err: any) {
      setError(err?.message || 'Failed to load CRM data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const api = getAuthenticatedApi();
      await api<CrmLead>('/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...newLead,
          userId: user?.id,
          source: newLead.source,
        }),
      });
      setShowCreate(false);
      setNewLead({ firstName: '', lastName: '', email: '', phone: '', company: '', jobTitle: '', source: 'assessment' });
      await loadData();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create lead');
    } finally {
      setCreating(false);
    }
  };

  const handleAdvance = async (leadId: string) => {
    try {
      const api = getAuthenticatedApi();
      await api<CrmLead>(`/crm/leads/${leadId}/advance`, { method: 'POST' });
      await loadData();
    } catch {
      setError('Failed to advance lead');
    }
  };

  const handleLose = async (leadId: string) => {
    if (!confirm('Mark this lead as closed lost?')) return;
    try {
      const api = getAuthenticatedApi();
      await api<CrmLead>(`/crm/leads/${leadId}/lose`, { method: 'POST' });
      await loadData();
    } catch {
      setError('Failed to update lead');
    }
  };

  const leadsByStatus = (status: string) => data?.leads.filter((l) => l.status === status) ?? [];

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="text-zinc-600 dark:text-zinc-400">Loading CRM...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-black dark:text-white">CRM Command Center</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Track leads, manage pipeline, and close more enrollments
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            >
              Admin
            </Link>
            <Link
              href="/sales"
              className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            >
              Sales
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              + New Lead
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* KPI Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Leads" value={leadStats?.total ?? 0} color="blue" />
          <StatCard label="New Today" value={leadStats?.new ?? 0} color="zinc" />
          <StatCard label="In Proposal" value={(leadStats?.proposal ?? 0) + (leadStats?.negotiation ?? 0)} color="indigo" />
          <StatCard label="Closed Won" value={leadStats?.closedWon ?? 0} color="emerald" />
          <StatCard label="Closed Lost" value={leadStats?.closedLost ?? 0} color="red" />
          <StatCard label="Nurturing" value={leadStats?.nurturing ?? 0} color="zinc" />
          <StatCard label="Pipeline Value" value={formatCurrency(pipelineTotal)} color="blue" isCurrency />
          <StatCard label="Closed Revenue" value={formatCurrency(closedRevenue)} color="emerald" isCurrency />
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 mb-6">
          <nav className="flex space-x-8">
            {(['leads', 'deals', 'clients'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Lead Pipeline Board */}
        {activeTab === 'leads' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-black dark:text-white">Lead Pipeline</h2>
              <div className="flex gap-2">
                <select
                  value={boardFilter}
                  onChange={(e) => setBoardFilter(e.target.value)}
                  className="text-sm px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white"
                >
                  <option value="">All stages</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {(boardFilter ? [boardFilter] : LEAD_STATUSES.filter((s) => s !== 'closed_lost' && s !== 'nurturing')).map((status) => (
                <div key={status} className="bg-zinc-100 dark:bg-zinc-900 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 capitalize">{status.replace('_', ' ')}</h3>
                    <span className="text-xs bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-full">
                      {leadsByStatus(status).length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {leadsByStatus(status).map((lead) => (
                      <div
                        key={lead.id}
                        className="bg-white dark:bg-zinc-800 rounded-lg p-3 shadow-sm border border-zinc-200 dark:border-zinc-700"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-medium text-sm text-black dark:text-white">{lead.firstName} {lead.lastName}</p>
                          {lead.aiGrade && (
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{lead.aiGrade}</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{lead.email}</p>
                        {lead.phone && <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{lead.phone}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[lead.status] || 'bg-zinc-100'}`}>
                            score {lead.score}
                          </span>
                          {status !== 'closed_won' && status !== 'closed_lost' && status !== 'nurturing' && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleAdvance(lead.id)}
                                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                title="Advance"
                              >
                                →
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {leadsByStatus(status).length === 0 && (
                      <div className="text-xs text-zinc-400 text-center py-4">No leads</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Top leads table */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-lg font-semibold text-black dark:text-white">Top Leads</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs uppercase">
                    <tr>
                      <th className="text-left p-4">Lead</th>
                      <th className="text-left p-4">Source</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-right p-4">Score</th>
                      <th className="text-right p-4">AI Score</th>
                      <th className="text-right p-4">Date</th>
                      <th className="text-right p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.leads.slice(0, 10).map((lead) => (
                      <tr key={lead.id} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="p-4">
                          <div className="font-medium text-black dark:text-white">{lead.firstName} {lead.lastName}</div>
                          <div className="text-xs text-zinc-500">{lead.email}</div>
                        </td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-400 capitalize">{lead.source.replace('_', ' ')}</td>
                        <td className="p-4">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_COLORS[lead.status] || 'bg-zinc-100'}`}>
                            {lead.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-right font-semibold text-black dark:text-white">{lead.score}</td>
                        <td className="p-4 text-right text-zinc-600 dark:text-zinc-400">{lead.aiScore ?? '—'}</td>
                        <td className="p-4 text-right text-zinc-500">{formatDate(lead.createdAt)}</td>
                        <td className="p-4 text-right">
                          {lead.status !== 'closed_won' && lead.status !== 'closed_lost' && (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleAdvance(lead.id)}
                                className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"
                              >
                                Advance
                              </button>
                              <button
                                onClick={() => handleLose(lead.id)}
                                className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded"
                              >
                                Lose
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!data?.leads.length && (
                      <tr><td colSpan={7} className="p-8 text-center text-zinc-500">No leads yet. Create your first lead to get started.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Deals / Pipeline */}
        {activeTab === 'deals' && (
          <div>
            <h2 className="text-lg font-semibold text-black dark:text-white mb-4">Deal Pipeline</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6 mb-8">
              <div className="space-y-4">
                {DEAL_STAGES.map((stage) => {
                  const value = data?.pipeline[stage] ?? 0;
                  const percentage = pipelineTotal > 0 ? (value / pipelineTotal) * 100 : 0;
                  return (
                    <div key={stage} className="flex items-center gap-4">
                      <div className="w-28 text-sm font-medium text-zinc-700 dark:text-zinc-300 capitalize">{stage.replace('_', ' ')}</div>
                      <div className="flex-1 h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${DEAL_STAGE_COLORS[stage] || 'bg-zinc-500'}`}
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>
                      <div className="w-24 text-right text-sm font-semibold text-black dark:text-white">{formatCurrency(value)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <h2 className="text-lg font-semibold text-black dark:text-white mb-4">Closed Deals</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.sales.map((deal) => (
                <div key={deal.id} className="bg-white dark:bg-zinc-900 rounded-xl p-5 shadow-sm border border-zinc-200 dark:border-zinc-800">
                  <h3 className="font-semibold text-black dark:text-white mb-1">{deal.title}</h3>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mb-2">{formatCurrency(deal.value)}</p>
                  <p className="text-xs text-zinc-500 capitalize">{deal.stage.replace('_', ' ')} · {deal.probability}% probability</p>
                </div>
              ))}
              {!data?.sales.length && (
                <div className="text-zinc-500 dark:text-zinc-400 col-span-full">No closed deals yet.</div>
              )}
            </div>
          </div>
        )}

        {/* Clients */}
        {activeTab === 'clients' && (
          <div>
            <h2 className="text-lg font-semibold text-black dark:text-white mb-4">Clients</h2>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 text-xs uppercase">
                  <tr>
                    <th className="text-left p-4">Name</th>
                    <th className="text-left p-4">Email</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Stage</th>
                    <th className="text-right p-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.clients.map((client) => (
                    <tr key={client.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="p-4 font-medium text-black dark:text-white">{client.firstName} {client.lastName}</td>
                      <td className="p-4 text-zinc-500">{client.email}</td>
                      <td className="p-4 text-zinc-600 dark:text-zinc-400 capitalize">{client.status}</td>
                      <td className="p-4 text-zinc-600 dark:text-zinc-400 capitalize">{client.lifecycleStage}</td>
                      <td className="p-4 text-right text-zinc-500">{formatDate(client.createdAt)}</td>
                    </tr>
                  ))}
                  {!data?.clients.length && (
                    <tr><td colSpan={5} className="p-8 text-center text-zinc-500">No clients yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create lead modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold text-black dark:text-white mb-4">Create New Lead</h2>
            {createError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">First Name *</label>
                  <input
                    required
                    value={newLead.firstName}
                    onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Last Name *</label>
                  <input
                    required
                    value={newLead.lastName}
                    onChange={(e) => setNewLead({ ...newLead, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Company</label>
                <input
                  value={newLead.company}
                  onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Source *</label>
                <select
                  value={newLead.source}
                  onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white"
                >
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  isCurrency,
}: {
  label: string;
  value: string | number;
  color: 'blue' | 'emerald' | 'red' | 'indigo' | 'zinc';
  isCurrency?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950 border-blue-100 dark:border-blue-900',
    emerald: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900',
    red: 'bg-red-50 dark:bg-red-950 border-red-100 dark:border-red-900',
    indigo: 'bg-indigo-50 dark:bg-indigo-950 border-indigo-100 dark:border-indigo-900',
    zinc: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800',
  };

  const valueClasses: Record<string, string> = {
    blue: 'text-blue-700 dark:text-blue-400',
    emerald: 'text-emerald-700 dark:text-emerald-400',
    red: 'text-red-700 dark:text-red-400',
    indigo: 'text-indigo-700 dark:text-indigo-400',
    zinc: 'text-zinc-900 dark:text-white',
  };

  return (
    <div className={`rounded-xl p-5 border ${colorClasses[color]}`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black ${valueClasses[color]}`}>{value}</p>
    </div>
  );
}
