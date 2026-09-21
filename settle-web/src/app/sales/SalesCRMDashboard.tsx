'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuth, getStoredToken, getStoredUser } from '@/lib/authUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

interface SalesLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  totalDebt: number;
  debtTypes?: string[];
  status: string;
  qualityScore?: number;
  salesNotes?: string;
  createdAt?: string;
  followUpDate?: string;
  lastContactedAt?: string;
  salesAgentId?: string;
}

interface Communication {
  id: string;
  communicationType: string;
  direction: string;
  status: string;
  subject?: string;
  body?: string;
  createdAt: string;
}

interface CollectionAccount {
  id: string;
  crmClientId: string;
  accountNumber?: string;
  originalBalance: number;
  currentBalance: number;
  status: string;
  priority?: number;
  debtorName?: string;
  debtorPhone?: string;
}

const DEBT_LABELS: Record<string, string> = {
  credit_card: 'Credit Cards',
  medical: 'Medical',
  personal_loan: 'Personal Loans',
  student_loan: 'Student Loans',
  business: 'Business',
  other: 'Other',
};

const STATUS_OPTIONS = ['new', 'contacted', 'interested', 'converted', 'rejected'];

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  converted: 'Converted',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  contacted: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  interested: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  converted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const PIPELINE_COLORS: Record<string, string> = {
  new: 'border-blue-400 bg-blue-50 dark:bg-blue-950/30',
  contacted: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
  interested: 'border-purple-400 bg-purple-50 dark:bg-purple-950/30',
  converted: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  rejected: 'border-red-400 bg-red-50 dark:bg-red-950/30',
};

const COLLECTION_STATUS_LABELS: Record<string, string> = {
  new: 'New', active: 'Active', contacted: 'Contacted', payment_plan: 'Payment Plan',
  settled: 'Settled', paid_in_full: 'Paid in Full', litigation: 'Litigation',
  charge_off: 'Charge Off', bankruptcy: 'Bankruptcy', deceased: 'Deceased', closed: 'Closed',
};

const EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
  intro: {
    subject: 'Help with your debt — Settle In Peace',
    body: `<p>Hi {{firstName}},</p><p>I came across your information through Settle In Peace. We help people like you find the best path out of debt — whether that's debt settlement, consolidation, or coaching.</p><p>Based on your situation, I believe we can help you reduce what you owe and get on a clear path forward. Would you be open to a quick 10-minute call this week?</p><p>Best regards,<br/>{{agentName}}<br/>Settle In Peace</p>`,
  },
  follow_up: {
    subject: 'Following up — Settle In Peace',
    body: `<p>Hi {{firstName}},</p><p>I wanted to follow up on my previous message. I know dealing with debt can feel overwhelming, but we've helped many people in similar situations find relief.</p><p>I'd love to schedule a brief call to discuss your options. What day works best for you?</p><p>Best regards,<br/>{{agentName}}<br/>Settle In Peace</p>`,
  },
  quote: {
    subject: 'Your debt relief options — Settle In Peace',
    body: `<p>Hi {{firstName}},</p><p>Thank you for your interest in Settle In Peace. Based on the information you provided, here's what we can offer:</p><p><strong>Estimated Debt:</strong> {{totalDebt}}<br/><strong>Program Length:</strong> 24-48 months<br/><strong>Estimateed Savings:</strong> Up to 50% of enrolled debt</p><p>I'd be happy to walk you through the details on a call. Please let me know a good time.</p><p>Best regards,<br/>{{agentName}}<br/>Settle In Peace</p>`,
  },
  custom: { subject: '', body: '' },
};

type Tab = 'leads' | 'inbox' | 'dialer' | 'email' | 'calendar' | 'collections';

function formatCurrency(amount?: number) {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));
}

function formatDate(date?: string) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(date?: string) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(date?: string) {
  if (!date) return 'never';
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function parseActivities(notes?: string) {
  if (!notes) return [];
  return notes.split(/\n?---+\n?/).map((b) => b.trim()).filter(Boolean).map((block) => {
    const match = block.match(/^\[?([^\]]+)\]?\s*([\s\S]*)$/);
    if (match) return { date: match[1].trim(), text: match[2].trim() };
    return { date: '', text: block };
  }).reverse();
}

interface SalesCRMDashboardProps {
  initialUser?: any;
}

export default function SalesCRMDashboard({ initialUser }: SalesCRMDashboardProps) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('leads');
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [inbox, setInbox] = useState<{ unassigned: SalesLead[]; mine: SalesLead[] }>({ unassigned: [], mine: [] });
  const [calendar, setCalendar] = useState<{ upcoming: SalesLead[]; overdue: SalesLead[] }>({ upcoming: [], overdue: [] });
  const [collections, setCollections] = useState<CollectionAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Lead management state
  const [view, setView] = useState<'list' | 'pipeline'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'debt' | 'quality'>('newest');
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'activity' | 'comms'>('overview');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [comms, setComms] = useState<Communication[]>([]);

  // Email state
  const [emailLead, setEmailLead] = useState<SalesLead | null>(null);
  const [emailTemplate, setEmailTemplate] = useState<string>('intro');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // Dialer state
  const [dialLead, setDialLead] = useState<SalesLead | null>(null);
  const [dialing, setDialing] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [callLogNotes, setCallLogNotes] = useState('');
  const [callResult, setCallResult] = useState('');

  // Calendar state
  const [scheduleLead, setScheduleLead] = useState<SalesLead | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleType, setScheduleType] = useState<'call' | 'email' | 'meeting'>('call');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const apiCall = useCallback(async (path: string, opts?: RequestInit) => {
    const token = getStoredToken();
    if (!token) throw new Error('No auth token');
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts?.headers },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }, []);

  const loadData = useCallback(async (token: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [leadsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/sales/leads`, { headers }).catch(() => null),
        fetch(`${API_URL}/sales/leads/stats`, { headers }).catch(() => null),
      ]);
      if (leadsRes?.ok) setLeads(await leadsRes.json());
      if (statsRes?.ok) setStats(await statsRes.json());
    } catch {
      setError('Failed to load sales data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      const data = await apiCall('/sales/inbox');
      setInbox(data);
    } catch { /* ignore */ }
  }, [apiCall]);

  const loadCalendar = useCallback(async () => {
    try {
      const data = await apiCall('/sales/calendar');
      setCalendar({ upcoming: data.upcoming || [], overdue: data.overdue || [] });
    } catch { /* ignore */ }
  }, [apiCall]);

  const loadCollections = useCallback(async () => {
    try {
      const data = await apiCall('/collections/accounts');
      // API returns { accounts, total, ... } — extract the accounts array
      setCollections(data.accounts || data || []);
    } catch { /* ignore */ }
  }, [apiCall]);

  const loadComms = useCallback(async (leadId: string) => {
    try {
      const data = await apiCall(`/sales/leads/${leadId}/communications`);
      setComms(Array.isArray(data) ? data : []);
    } catch { setComms([]); }
  }, [apiCall]);

  useEffect(() => {
    const token = getStoredToken();
    const parsed = initialUser ?? getStoredUser();
    if (!token) { router.push('/login'); return; }
    if (!parsed) { router.push('/login'); return; }
    if (parsed.role !== 'sales' && parsed.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setUser(parsed);
    loadData(token);
  }, [router, initialUser, loadData]);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (tab === 'inbox') loadInbox();
    if (tab === 'calendar') loadCalendar();
    if (tab === 'collections') loadCollections();
  }, [tab, loadInbox, loadCalendar, loadCollections]);

  const filteredLeads = useMemo(() => {
    let out = [...leads];
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((l) =>
        l.firstName?.toLowerCase().includes(q) || l.lastName?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) || l.phone?.toLowerCase().includes(q) ||
        l.state?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) out = out.filter((l) => l.status === statusFilter);
    if (sortBy === 'newest') out.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (sortBy === 'debt') out.sort((a, b) => Number(b.totalDebt || 0) - Number(a.totalDebt || 0));
    if (sortBy === 'quality') out.sort((a, b) => Number(b.qualityScore || 0) - Number(a.qualityScore || 0));
    return out;
  }, [leads, search, statusFilter, sortBy]);

  const pipelineCounts = useMemo(() => {
    return STATUS_OPTIONS.reduce<Record<string, SalesLead[]>>((acc, s) => {
      acc[s] = filteredLeads.filter((l) => l.status === s);
      return acc;
    }, {});
  }, [filteredLeads]);

  const handleSave = async () => {
    const token = getStoredToken();
    if (!token || !selectedLead) return;
    setSaving(true);
    try {
      if (status && status !== selectedLead.status) {
        await fetch(`${API_URL}/sales/leads/${selectedLead.id}/status`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, notes: notes.trim() ? notes : undefined }),
        });
      } else if (notes.trim()) {
        await fetch(`${API_URL}/sales/leads/${selectedLead.id}/notes`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        });
      }
      setSelectedLead(null); setNotes(''); setStatus('');
      await loadData(token);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleAssignLead = async (leadId: string) => {
    try {
      await apiCall(`/sales/leads/${leadId}/assign`, { method: 'POST' });
      await loadInbox();
      const token = getStoredToken();
      if (token) await loadData(token);
    } catch (err: any) { setError(err.message); }
  };

  const handleSendEmail = async () => {
    if (!emailLead) return;
    setEmailSending(true);
    try {
      await apiCall(`/sales/leads/${emailLead.id}/email`, {
        method: 'POST',
        body: JSON.stringify({ subject: emailSubject, body: emailBody }),
      });
      setEmailLead(null); setEmailSubject(''); setEmailBody(''); setEmailTemplate('intro');
      const token = getStoredToken();
      if (token) await loadData(token);
    } catch (err: any) { setError(err.message); }
    finally { setEmailSending(false); }
  };

  const handleDial = async () => {
    if (!dialLead) return;
    setDialing(true); setCallStatus('Dialing...');
    try {
      const result = await apiCall(`/sales/leads/${dialLead.id}/dial`, {
        method: 'POST',
        body: JSON.stringify({ to: dialLead.phone }),
      });
      setCallStatus(result.success ? `Call initiated (ID: ${result.callControlId})` : `Failed: ${result.error}`);
    } catch (err: any) { setCallStatus(`Error: ${err.message}`); }
    finally { setDialing(false); }
  };

  const handleLogCall = async () => {
    if (!dialLead) return;
    try {
      await apiCall(`/sales/leads/${dialLead.id}/call-log`, {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: dialLead.phone,
          direction: 'outbound',
          status: callResult || 'completed',
          notes: callLogNotes,
        }),
      });
      setDialLead(null); setCallStatus(''); setCallLogNotes(''); setCallResult('');
      const token = getStoredToken();
      if (token) await loadData(token);
    } catch (err: any) { setError(err.message); }
  };

  const handleSchedule = async () => {
    if (!scheduleLead || !scheduleDate) return;
    try {
      await apiCall(`/sales/leads/${scheduleLead.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ followUpDate: scheduleDate, type: scheduleType, notes: scheduleNotes }),
      });
      setScheduleLead(null); setScheduleDate(''); setScheduleNotes('');
      await loadCalendar();
      const token = getStoredToken();
      if (token) await loadData(token);
    } catch (err: any) { setError(err.message); }
  };

  const openLead = (lead: SalesLead) => {
    setSelectedLead(lead); setStatus(lead.status); setNotes(''); setDetailTab('overview');
    loadComms(lead.id);
  };

  const openEmail = (lead: SalesLead) => {
    setEmailLead(lead);
    const tpl = EMAIL_TEMPLATES['intro'];
    setEmailTemplate('intro');
    setEmailSubject(tpl.subject);
    setEmailBody(tpl.body.replace(/{{firstName}}/g, lead.firstName).replace(/{{agentName}}/g, user?.firstName || 'Sales Agent').replace(/{{totalDebt}}/g, formatCurrency(Number(lead.totalDebt))));
  };

  const handleTemplateChange = (tpl: string) => {
    setEmailTemplate(tpl);
    const template = EMAIL_TEMPLATES[tpl];
    if (template && emailLead) {
      setEmailSubject(template.subject);
      setEmailBody(template.body.replace(/{{firstName}}/g, emailLead.firstName).replace(/{{agentName}}/g, user?.firstName || 'Sales Agent').replace(/{{totalDebt}}/g, formatCurrency(Number(emailLead.totalDebt))));
    }
  };

  const handleLogout = () => { clearAuth(); router.push('/'); };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="text-zinc-500">Loading your CRM...</div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'leads', label: 'Leads', badge: leads.length },
    { key: 'inbox', label: 'Inbox', badge: (inbox.unassigned?.length || 0) + (inbox.mine?.length || 0) },
    { key: 'dialer', label: 'Dialer' },
    { key: 'email', label: 'Email' },
    { key: 'calendar', label: 'Calendar', badge: (calendar.overdue?.length || 0) + (calendar.upcoming?.length || 0) },
    { key: 'collections', label: 'Collections', badge: collections.length },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-black dark:text-white">Sales CRM</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Welcome back, {user?.firstName || user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 px-2 py-1 rounded-full font-medium">Sales Agent</span>
            <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-red-500">Logout</button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-blue-100 dark:bg-blue-950' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* ─── Stats Bar ─── */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-6">
          {[
            { label: 'My Leads', value: stats?.total ?? leads.length, color: 'text-black dark:text-white' },
            { label: 'New', value: stats?.new ?? leads.filter((l) => l.status === 'new').length, color: 'text-blue-600' },
            { label: 'Contacted', value: stats?.contacted ?? leads.filter((l) => l.status === 'contacted').length, color: 'text-amber-600' },
            { label: 'Interested', value: stats?.interested ?? leads.filter((l) => l.status === 'interested').length, color: 'text-purple-600' },
            { label: 'Converted', value: stats?.converted ?? leads.filter((l) => l.status === 'converted').length, color: 'text-emerald-600' },
            { label: 'Follow-ups Due', value: stats?.followUpsDue ?? 0, color: 'text-orange-600' },
            { label: 'Conversion %', value: `${stats?.conversionRate ?? 0}%`, color: 'text-pink-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-4">
              <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{s.label}</div>
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ─── Leads Tab ─── */}
        {tab === 'leads' && (
          <>
            <div className="flex flex-col md:flex-row gap-3 mb-6 items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <input type="text" placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm w-full sm:w-64" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm">
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm">
                  <option value="newest">Newest First</option>
                  <option value="debt">Highest Debt</option>
                  <option value="quality">Highest Quality</option>
                </select>
              </div>
              <div className="flex gap-2 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {(['list', 'pipeline'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${view === v ? 'bg-zinc-900 dark:bg-zinc-700 text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {view === 'list' && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4">Lead</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-left p-4">State</th>
                      <th className="text-right p-4">Debt</th>
                      <th className="text-right p-4">Quality</th>
                      <th className="text-left p-4">Follow-up</th>
                      <th className="text-right p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-zinc-500">No leads match your filters.</td></tr>
                    ) : filteredLeads.map((l) => (
                      <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="p-4">
                          <div className="font-semibold text-black dark:text-white">{l.firstName} {l.lastName}</div>
                          <div className="text-xs text-zinc-400">{l.email} · {l.phone}</div>
                        </td>
                        <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full capitalize ${STATUS_COLORS[l.status] || ''}`}>{l.status}</span></td>
                        <td className="p-4 text-black dark:text-white">{l.state}</td>
                        <td className="p-4 text-right font-bold text-black dark:text-white">{formatCurrency(l.totalDebt)}</td>
                        <td className="p-4 text-right">{typeof l.qualityScore === 'number' ? <span className={`font-bold ${l.qualityScore >= 70 ? 'text-green-600' : l.qualityScore >= 40 ? 'text-blue-600' : 'text-zinc-400'}`}>{l.qualityScore}</span> : '—'}</td>
                        <td className="p-4 text-xs text-zinc-500">{l.followUpDate ? formatDateTime(l.followUpDate) : '—'}</td>
                        <td className="p-4 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => openLead(l)} className="px-2 py-1 text-xs font-bold border border-blue-600 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-950">Manage</button>
                            <button onClick={() => openEmail(l)} className="px-2 py-1 text-xs font-bold border border-purple-600 text-purple-600 dark:text-purple-400 rounded hover:bg-purple-50 dark:hover:bg-purple-950">Email</button>
                            <button onClick={() => setDialLead(l)} className="px-2 py-1 text-xs font-bold border border-green-600 text-green-600 dark:text-green-400 rounded hover:bg-green-50 dark:hover:bg-green-950">Call</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {view === 'pipeline' && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-2">
                {STATUS_OPTIONS.map((s) => (
                  <div key={s} className="bg-zinc-100 dark:bg-zinc-950 rounded-2xl p-3 min-w-[220px]">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-black dark:text-white capitalize">{STATUS_LABELS[s]}</h3>
                      <span className="text-xs bg-white dark:bg-zinc-900 text-zinc-500 px-2 py-0.5 rounded-full">{pipelineCounts[s].length}</span>
                    </div>
                    <div className="space-y-3">
                      {pipelineCounts[s].map((l) => (
                        <button key={l.id} onClick={() => openLead(l)}
                          className={`w-full text-left p-3 rounded-xl border-l-4 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-all ${PIPELINE_COLORS[s]}`}>
                          <div className="font-semibold text-sm text-black dark:text-white truncate">{l.firstName} {l.lastName}</div>
                          <div className="text-xs text-zinc-500 truncate">{l.state} · {formatCurrency(l.totalDebt)}</div>
                          {typeof l.qualityScore === 'number' && <div className="mt-1 text-xs font-bold text-zinc-500">Score {l.qualityScore}</div>}
                        </button>
                      ))}
                      {pipelineCounts[s].length === 0 && <div className="text-xs text-zinc-400 text-center py-4">No leads</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── Inbox Tab ─── */}
        {tab === 'inbox' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-black dark:text-white mb-3">New Leads from Website</h2>
              <p className="text-sm text-zinc-500 mb-4">Leads that came in from the assessment form or contact page and haven't been assigned yet.</p>
              {inbox.unassigned?.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center text-zinc-500">No unassigned leads. Check back later!</div>
              ) : (
                <div className="space-y-3">
                  {inbox.unassigned?.map((l) => (
                    <div key={l.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-black dark:text-white">{l.firstName} {l.lastName}</div>
                        <div className="text-xs text-zinc-400">{l.email} · {l.phone} · {l.state}</div>
                        <div className="text-xs text-zinc-500 mt-1">Debt: {formatCurrency(l.totalDebt)} · Score: {l.qualityScore ?? '—'} · {timeAgo(l.createdAt)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAssignLead(l.id)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">Claim Lead</button>
                        <button onClick={() => { handleAssignLead(l.id); openLead(l); }} className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800">Claim & View</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {inbox.mine?.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-black dark:text-white mb-3">Assigned but Not Yet Contacted</h2>
                <div className="space-y-3">
                  {inbox.mine.map((l) => (
                    <div key={l.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-black dark:text-white">{l.firstName} {l.lastName}</div>
                        <div className="text-xs text-zinc-400">{l.email} · {l.phone} · {l.state}</div>
                        <div className="text-xs text-zinc-500 mt-1">Debt: {formatCurrency(l.totalDebt)} · {timeAgo(l.createdAt)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openLead(l)} className="px-3 py-2 border border-blue-600 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950">Manage</button>
                        <button onClick={() => setDialLead(l)} className="px-3 py-2 border border-green-600 text-green-600 rounded-lg text-xs font-bold hover:bg-green-50 dark:hover:bg-green-950">Call</button>
                        <button onClick={() => openEmail(l)} className="px-3 py-2 border border-purple-600 text-purple-600 rounded-lg text-xs font-bold hover:bg-purple-50 dark:hover:bg-purple-950">Email</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Dialer Tab ─── */}
        {tab === 'dialer' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-black dark:text-white">Integrated Dialer</h2>
            <p className="text-sm text-zinc-500">Click-to-call your leads using Telnyx. Calls are logged automatically.</p>
            {!dialLead ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4">
                <h3 className="font-semibold text-black dark:text-white mb-3">Select a lead to call:</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {leads.length === 0 ? <p className="text-zinc-500 text-sm">No leads assigned to you.</p> : leads.map((l) => (
                    <button key={l.id} onClick={() => { setDialLead(l); setCallStatus(''); setCallLogNotes(''); setCallResult(''); }}
                      className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm text-black dark:text-white">{l.firstName} {l.lastName}</div>
                        <div className="text-xs text-zinc-400">{l.phone} · {l.state} · Last contact: {timeAgo(l.lastContactedAt)}</div>
                      </div>
                      <span className="text-green-600 text-xs font-bold">Dial →</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-6 max-w-lg">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-bold text-black dark:text-white">{dialLead.firstName} {dialLead.lastName}</h3>
                    <p className="text-sm text-zinc-500">{dialLead.phone} · {dialLead.email}</p>
                  </div>
                  <button onClick={() => setDialLead(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
                </div>
                <div className="space-y-4">
                  <button onClick={handleDial} disabled={dialing}
                    className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {dialing ? 'Dialing...' : `📞 Call ${dialLead.phone}`}
                  </button>
                  {callStatus && <div className="text-sm text-center text-zinc-600 dark:text-zinc-400 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">{callStatus}</div>}
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Call Result</label>
                    <select value={callResult} onChange={(e) => setCallResult(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm">
                      <option value="">Select result...</option>
                      <option value="completed">Completed (connected)</option>
                      <option value="no_answer">No answer</option>
                      <option value="left_voicemail">Left voicemail</option>
                      <option value="busy">Busy</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Call Notes</label>
                    <textarea value={callLogNotes} onChange={(e) => setCallLogNotes(e.target.value)} rows={3}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm"
                      placeholder="Notes from the call..." />
                  </div>
                  <button onClick={handleLogCall} disabled={!callResult}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                    Log Call
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Email Tab ─── */}
        {tab === 'email' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-black dark:text-white">Email Leads</h2>
            <p className="text-sm text-zinc-500">Send personalized emails to your leads. Choose a template or write a custom email.</p>
            {!emailLead ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4">
                <h3 className="font-semibold text-black dark:text-white mb-3">Select a lead to email:</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {leads.length === 0 ? <p className="text-zinc-500 text-sm">No leads assigned to you.</p> : leads.map((l) => (
                    <button key={l.id} onClick={() => openEmail(l)}
                      className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm text-black dark:text-white">{l.firstName} {l.lastName}</div>
                        <div className="text-xs text-zinc-400">{l.email} · {l.state}</div>
                      </div>
                      <span className="text-purple-600 text-xs font-bold">Email →</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-6 max-w-2xl">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-bold text-black dark:text-white">To: {emailLead.firstName} {emailLead.lastName}</h3>
                    <p className="text-sm text-zinc-500">{emailLead.email}</p>
                  </div>
                  <button onClick={() => setEmailLead(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Template</label>
                    <select value={emailTemplate} onChange={(e) => handleTemplateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm">
                      <option value="intro">Introduction</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="quote">Quote / Options</option>
                      <option value="custom">Custom (blank)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Subject</label>
                    <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm" />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Message (HTML)</label>
                    <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={10}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm font-mono" />
                  </div>
                  <button onClick={handleSendEmail} disabled={emailSending || !emailSubject || !emailBody}
                    className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 disabled:opacity-50">
                    {emailSending ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Calendar Tab ─── */}
        {tab === 'calendar' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-black dark:text-white">Calendar & Follow-ups</h2>
                <p className="text-sm text-zinc-500">Scheduled follow-ups and appointments</p>
              </div>
            </div>

            {calendar.overdue?.length > 0 && (
              <div>
                <h3 className="font-semibold text-red-600 mb-3">⚠️ Overdue ({calendar.overdue.length})</h3>
                <div className="space-y-2">
                  {calendar.overdue.map((l) => (
                    <div key={l.id} className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-black dark:text-white">{l.firstName} {l.lastName}</div>
                        <div className="text-xs text-zinc-500">{l.phone} · {l.email}</div>
                        <div className="text-xs text-red-600 font-medium mt-1">Was due: {formatDateTime(l.followUpDate)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setDialLead(l)} className="px-3 py-1.5 text-xs font-bold border border-green-600 text-green-600 rounded hover:bg-green-50 dark:hover:bg-green-950">Call</button>
                        <button onClick={() => openEmail(l)} className="px-3 py-1.5 text-xs font-bold border border-purple-600 text-purple-600 rounded hover:bg-purple-50 dark:hover:bg-purple-950">Email</button>
                        <button onClick={() => openLead(l)} className="px-3 py-1.5 text-xs font-bold border border-blue-600 text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-950">Manage</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold text-black dark:text-white mb-3">Upcoming Follow-ups</h3>
              {calendar.upcoming?.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center text-zinc-500">No upcoming follow-ups scheduled.</div>
              ) : (
                <div className="space-y-2">
                  {calendar.upcoming.map((l) => (
                    <div key={l.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-black dark:text-white">{l.firstName} {l.lastName}</div>
                        <div className="text-xs text-zinc-500">{l.phone} · {l.state}</div>
                        <div className="text-xs text-blue-600 font-medium mt-1">📅 {formatDateTime(l.followUpDate)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setDialLead(l)} className="px-3 py-1.5 text-xs font-bold border border-green-600 text-green-600 rounded hover:bg-green-50 dark:hover:bg-green-950">Call</button>
                        <button onClick={() => openEmail(l)} className="px-3 py-1.5 text-xs font-bold border border-purple-600 text-purple-600 rounded hover:bg-purple-50 dark:hover:bg-purple-950">Email</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick schedule */}
            {!scheduleLead ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4">
                <h3 className="font-semibold text-black dark:text-white mb-3">Schedule a Follow-up</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {leads.map((l) => (
                    <button key={l.id} onClick={() => setScheduleLead(l)}
                      className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex justify-between">
                      <span className="text-sm font-medium text-black dark:text-white">{l.firstName} {l.lastName}</span>
                      <span className="text-xs text-zinc-400">{l.state} · {formatCurrency(l.totalDebt)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-6 max-w-lg">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-black dark:text-white">Schedule: {scheduleLead.firstName} {scheduleLead.lastName}</h3>
                  <button onClick={() => setScheduleLead(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Date & Time</label>
                    <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm" />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Type</label>
                    <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm">
                      <option value="call">Phone Call</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
                    <textarea value={scheduleNotes} onChange={(e) => setScheduleNotes(e.target.value)} rows={2}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm"
                      placeholder="What's this follow-up about?" />
                  </div>
                  <button onClick={handleSchedule} disabled={!scheduleDate}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                    Schedule Follow-up
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Collections Tab ─── */}
        {tab === 'collections' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-black dark:text-white">Debt Collections</h2>
            <p className="text-sm text-zinc-500">Collection accounts assigned to you. Manage payment plans, contact debtors, and track recovery.</p>
            {collections.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-8 text-center text-zinc-500">No collection accounts assigned to you.</div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-4">Account</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-right p-4">Current Balance</th>
                      <th className="text-right p-4">Original</th>
                      <th className="text-left p-4">Priority</th>
                      <th className="text-right p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((c) => (
                      <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="p-4">
                          <div className="font-semibold text-black dark:text-white">{c.debtorName || c.accountNumber || c.crmClientId}</div>
                          <div className="text-xs text-zinc-400">{c.debtorPhone || '—'}</div>
                        </td>
                        <td className="p-4"><span className="text-xs font-bold px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{COLLECTION_STATUS_LABELS[c.status] || c.status}</span></td>
                        <td className="p-4 text-right font-bold text-black dark:text-white">{formatCurrency(c.currentBalance)}</td>
                        <td className="p-4 text-right text-zinc-500">{formatCurrency(c.originalBalance)}</td>
                        <td className="p-4">{c.priority ? <span className={`text-xs font-bold ${c.priority >= 3 ? 'text-red-600' : c.priority === 2 ? 'text-amber-600' : 'text-green-600'}`}>{['', 'Low', 'Medium', 'High', 'Critical'][c.priority]}</span> : '—'}</td>
                        <td className="p-4 text-right">
                          <a href={`/collections`} className="px-3 py-1.5 text-xs font-bold border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950">Open Collections</a>
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

      {/* ─── Lead Detail Modal ─── */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-black dark:text-white">{selectedLead.firstName} {selectedLead.lastName}</h2>
                <div className="text-sm text-zinc-500">{selectedLead.email} · {selectedLead.phone} · {selectedLead.state}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize ${STATUS_COLORS[selectedLead.status] || ''}`}>{selectedLead.status}</span>
                <button onClick={() => setSelectedLead(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 flex gap-2">
              <button onClick={() => setDialLead(selectedLead)} className="px-3 py-1.5 text-xs font-bold border border-green-600 text-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-950">📞 Call</button>
              <button onClick={() => openEmail(selectedLead)} className="px-3 py-1.5 text-xs font-bold border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950">✉️ Email</button>
              <button onClick={() => setScheduleLead(selectedLead)} className="px-3 py-1.5 text-xs font-bold border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950">📅 Schedule</button>
            </div>

            <div className="flex border-b border-zinc-100 dark:border-zinc-800">
              {(['overview', 'activity', 'comms'] as const).map((t) => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`flex-1 py-3 text-sm font-medium capitalize ${detailTab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}>
                  {t === 'comms' ? 'Communications' : t}
                </button>
              ))}
            </div>

            <div className="p-6">
              {detailTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
                      <div className="text-zinc-500 text-xs mb-1">Total Debt</div>
                      <div className="text-xl font-black text-black dark:text-white">{formatCurrency(selectedLead.totalDebt)}</div>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
                      <div className="text-zinc-500 text-xs mb-1">Quality Score</div>
                      <div className="text-xl font-black text-black dark:text-white">{selectedLead.qualityScore ?? '—'}</div>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
                      <div className="text-zinc-500 text-xs mb-1">Created</div>
                      <div className="font-semibold text-black dark:text-white">{formatDate(selectedLead.createdAt)}</div>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4">
                      <div className="text-zinc-500 text-xs mb-1">Last Contacted</div>
                      <div className="font-semibold text-black dark:text-white">{timeAgo(selectedLead.lastContactedAt)}</div>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 col-span-2">
                      <div className="text-zinc-500 text-xs mb-1">Debt Types</div>
                      <div className="font-semibold text-black dark:text-white">{selectedLead.debtTypes?.map((t) => DEBT_LABELS[t] || t).join(', ') || '—'}</div>
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Update Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 dark:text-white">
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 dark:text-white"
                      placeholder="Add a note or call outcome..." />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => setSelectedLead(null)} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900">Cancel</button>
                    <button onClick={handleSave} disabled={saving || (status === selectedLead.status && !notes.trim())}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save Update'}
                    </button>
                  </div>
                </div>
              )}

              {detailTab === 'activity' && (
                <div className="space-y-4">
                  {parseActivities(selectedLead.salesNotes).length === 0 ? (
                    <p className="text-zinc-500 text-sm">No activity yet.</p>
                  ) : parseActivities(selectedLead.salesNotes).map((a, idx) => (
                    <div key={idx} className="border-l-2 border-blue-500 pl-4 py-1">
                      {a.date && <div className="text-xs text-zinc-400 mb-1">{a.date}</div>}
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{a.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {detailTab === 'comms' && (
                <div className="space-y-3">
                  {comms.length === 0 ? (
                    <p className="text-zinc-500 text-sm">No communications logged yet.</p>
                  ) : comms.map((c) => (
                    <div key={c.id} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.communicationType === 'email' ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' : 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300'}`}>
                          {c.communicationType === 'email' ? '✉️' : '📞'} {c.direction}
                        </span>
                        <span className="text-xs text-zinc-400">{formatDateTime(c.createdAt)}</span>
                      </div>
                      {c.subject && <div className="text-sm font-medium text-black dark:text-white">{c.subject}</div>}
                      {c.body && <div className="text-xs text-zinc-500 mt-1 line-clamp-3">{c.body}</div>}
                      <div className={`text-xs mt-1 ${c.status === 'failed' || c.status === 'bounced' ? 'text-red-500' : 'text-green-500'}`}>Status: {c.status}</div>
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
