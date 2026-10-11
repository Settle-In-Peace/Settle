'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearAuth, getStoredToken, getStoredUser } from '@/lib/authUtils';
import Logo from '@/components/Logo';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

interface MatchedLead {
  id: string;
  matchId?: string;
  matchScore: number;
  matchReasons?: string[];
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state?: string;
  zipCode?: string;
  totalDebt: number;
  debtTypes?: string[];
  qualityScore?: number;
  employmentStatus?: string;
  monthlyIncome?: number;
  monthsBehind?: number;
  createdAt?: string;
  status?: string;
  salePrice?: number;
  purchasedAt?: string;
}

interface PortalStats {
  creditBalance?: number;
  leadsPurchased?: number;
  activeMatches?: number;
  conversionRate?: number;
  successfulSettlements?: number;
  avgRating?: number;
  reviewCount?: number;
  isAcceptingLeads?: boolean;
}

const DEBT_LABELS: Record<string, string> = {
  credit_card: 'Credit Cards', medical: 'Medical', personal_loan: 'Personal Loans',
  student_loan: 'Student Loans', business: 'Business', other: 'Other',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: 'Full-Time', self_employed: 'Self-Employed', part_time: 'Part-Time',
  unemployed: 'Unemployed', retired: 'Retired', other: 'Other',
};

function getToken(): string | null {
  return getStoredToken();
}

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<PortalStats | null>(null);
  const [matchedLeads, setMatchedLeads] = useState<MatchedLead[]>([]);
  const [myLeads, setMyLeads] = useState<MatchedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'matched' | 'purchased'>('matched');
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const token = getStoredToken();
    const parsed = getStoredUser();
    if (!token || !parsed) {
      router.push('/login');
      return;
    }
    if (parsed.role !== 'provider') {
      router.push('/dashboard');
      return;
    }
    setUser(parsed);
    loadData(token);
  }, []);

  const loadData = async (token: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, matchedRes, myLeadsRes] = await Promise.all([
        fetch(`${API_URL}/providers/portal/stats`, { headers }).catch(() => null),
        fetch(`${API_URL}/matching/matched-leads`, { headers }).catch(() => null),
        fetch(`${API_URL}/leads/my-leads`, { headers }).catch(() => null),
      ]);
      if (statsRes?.ok) setStats(await statsRes.json());
      if (matchedRes?.ok) {
        const data = await matchedRes.json();
        setMatchedLeads(Array.isArray(data) ? data : data?.leads ?? []);
      }
      if (myLeadsRes?.ok) {
        const data = await myLeadsRes.json();
        setMyLeads(Array.isArray(data) ? data : data?.leads ?? []);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (leadId: string) => {
    const token = getToken();
    if (!token) return;
    setPurchasing(leadId);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/leads/${leadId}/purchase`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Purchase failed — check your credit balance');
      }
      setSuccessMsg('Lead purchased successfully! Contact details are now available.');
      await loadData(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPurchasing(null);
    }
  };

  const handleDecline = async (matchId: string) => {
    const token = getToken();
    if (!token) return;
    setDeclining(matchId);
    setError('');
    try {
      const res = await fetch(`${API_URL}/matching/${matchId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to decline match');
      }
      setMatchedLeads(prev => prev.filter(l => (l.matchId || l.id) !== matchId));
      setSuccessMsg('Match declined.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeclining(null);
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
          <div className="text-zinc-500">Loading your portal...</div>
        </div>
      </div>
    );
  }

  const conversionRate = stats?.conversionRate ?? (stats?.leadsPurchased && stats?.activeMatches
    ? Math.round((stats.leadsPurchased / (stats.leadsPurchased + stats.activeMatches)) * 100)
    : 0);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Top bar */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl">
              <Logo />
            </Link>
            <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full font-medium">Provider Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 hidden sm:block">{user?.email}</span>
            <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-red-500">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
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

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Credit Balance</div>
            <div className="text-2xl font-black text-green-600">${stats?.creditBalance ?? 0}</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Leads Purchased</div>
            <div className="text-2xl font-black text-black dark:text-white">{stats?.leadsPurchased ?? myLeads.length}</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Active Matches</div>
            <div className="text-2xl font-black text-blue-600">{stats?.activeMatches ?? matchedLeads.length}</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-5">
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Conversion Rate</div>
            <div className="text-2xl font-black text-purple-600">{conversionRate}%</div>
          </div>
        </div>

        {/* Buy credits button */}
        <div className="flex justify-end mb-6">
          <Link
            href="/portal/billing"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm"
          >
            Buy Credits →
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'matched' as const, label: `Matched Leads (${matchedLeads.length})` },
            { id: 'purchased' as const, label: `Purchased Leads (${myLeads.length})` },
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

        {/* Matched Leads tab */}
        {activeTab === 'matched' && (
          <div className="space-y-4">
            {matchedLeads.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-12 text-center">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🎯</span>
                </div>
                <h3 className="text-lg font-bold text-black dark:text-white mb-2">No matched leads yet</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto">
                  When consumers complete an assessment that matches your criteria, their leads will appear here ranked by match score.
                </p>
              </div>
            ) : (
              matchedLeads
                .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
                .map(lead => {
                  const matchId = lead.matchId || lead.id;
                  const isExpanded = expandedLead === lead.id;
                  return (
                    <div key={lead.id} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-3 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full bg-green-600">
                                {lead.matchScore}% Match
                              </span>
                              {typeof lead.qualityScore === 'number' && (
                                <span className="text-xs font-bold text-white px-2 py-1 rounded-full" style={{
                                  backgroundColor: lead.qualityScore >= 70 ? '#16a34a' : lead.qualityScore >= 40 ? '#2563eb' : '#a1a1aa'
                                }}>
                                  Quality: {lead.qualityScore}
                                </span>
                              )}
                              {lead.state && (
                                <span className="text-xs text-zinc-400">📍 {lead.state}</span>
                              )}
                              {lead.createdAt && (
                                <span className="text-xs text-zinc-400">{new Date(lead.createdAt).toLocaleDateString()}</span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="text-zinc-400 text-xs">Debt Amount</div>
                                <div className="font-bold text-black dark:text-white">${Number(lead.totalDebt).toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-zinc-400 text-xs">Debt Types</div>
                                <div className="font-bold text-black dark:text-white text-sm">
                                  {lead.debtTypes?.map((t) => DEBT_LABELS[t] || t).join(', ') || '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-zinc-400 text-xs">Employment</div>
                                <div className="font-bold text-black dark:text-white text-sm">
                                  {lead.employmentStatus ? EMPLOYMENT_LABELS[lead.employmentStatus] || lead.employmentStatus : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-zinc-400 text-xs">Monthly Income</div>
                                <div className="font-bold text-black dark:text-white">
                                  {lead.monthlyIncome ? `$${Number(lead.monthlyIncome).toLocaleString()}/mo` : '—'}
                                </div>
                              </div>
                            </div>

                            {lead.monthsBehind !== undefined && (
                              <div className="mt-3 text-xs text-zinc-400">
                                {lead.monthsBehind > 0 ? `${lead.monthsBehind}+ months behind on payments` : 'Current on payments'}
                              </div>
                            )}

                            {/* Match reasons */}
                            {lead.matchReasons && lead.matchReasons.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-4">
                                {lead.matchReasons.map((reason, i) => (
                                  <span key={i} className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full font-medium border border-green-200 dark:border-green-800">
                                    ✓ {reason}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Expanded contact details (only for purchased) */}
                            {isExpanded && lead.email && (
                              <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg space-y-1 text-sm">
                                <div className="font-semibold text-black dark:text-white mb-2">Contact Details</div>
                                <div className="text-zinc-600 dark:text-zinc-400">📧 {lead.email}</div>
                                <div className="text-zinc-600 dark:text-zinc-400">📱 {lead.phone}</div>
                                <div className="text-zinc-600 dark:text-zinc-400">📍 {lead.state} {lead.zipCode}</div>
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-col gap-2 min-w-[140px]">
                            <button
                              onClick={() => setExpandedLead(isExpanded ? null : lead.id)}
                              className="px-4 py-2 border-2 border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-bold hover:bg-blue-50 dark:hover:bg-blue-950 transition-all"
                            >
                              {isExpanded ? 'Hide Details' : 'View Details'}
                            </button>
                            <button
                              onClick={() => handlePurchase(lead.id)}
                              disabled={purchasing === lead.id}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-all"
                            >
                              {purchasing === lead.id ? 'Processing...' : 'Purchase Lead →'}
                            </button>
                            <button
                              onClick={() => handleDecline(matchId)}
                              disabled={declining === matchId}
                              className="px-4 py-2 text-zinc-500 hover:text-red-500 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            >
                              {declining === matchId ? 'Declining...' : 'Decline'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {/* Purchased Leads tab */}
        {activeTab === 'purchased' && (
          <div className="space-y-4">
            {myLeads.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-12 text-center">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📦</span>
                </div>
                <h3 className="text-lg font-bold text-black dark:text-white mb-2">No purchased leads yet</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-4 max-w-md mx-auto">
                  Purchase matched leads to unlock full consumer contact details and start helping them settle their debt.
                </p>
                <button
                  onClick={() => setActiveTab('matched')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  View Matched Leads →
                </button>
              </div>
            ) : (
              myLeads.map(lead => (
                <div key={lead.id} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-100 dark:border-zinc-800 p-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-white px-2 py-1 rounded-full bg-green-600">Purchased</span>
                      {lead.salePrice && (
                        <span className="text-xs text-zinc-400">${lead.salePrice}</span>
                      )}
                      {lead.purchasedAt && (
                        <span className="text-xs text-zinc-400">{new Date(lead.purchasedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    {typeof lead.matchScore === 'number' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full bg-green-600">
                        {lead.matchScore}% Match
                      </span>
                    )}
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-bold text-black dark:text-white text-lg mb-2">
                        {lead.firstName} {lead.lastName}
                      </h3>
                      <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                        <div>📧 {lead.email}</div>
                        <div>📱 {lead.phone}</div>
                        <div>📍 {lead.state} {lead.zipCode}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-zinc-400 text-xs">Debt Amount</div>
                        <div className="font-bold text-black dark:text-white">${Number(lead.totalDebt).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400 text-xs">Debt Types</div>
                        <div className="font-bold text-black dark:text-white text-sm">
                          {lead.debtTypes?.map((t) => DEBT_LABELS[t] || t).join(', ') || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-400 text-xs">Employment</div>
                        <div className="font-bold text-black dark:text-white text-sm">
                          {lead.employmentStatus ? EMPLOYMENT_LABELS[lead.employmentStatus] || lead.employmentStatus : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-400 text-xs">Income</div>
                        <div className="font-bold text-black dark:text-white">
                          {lead.monthlyIncome ? `$${Number(lead.monthlyIncome).toLocaleString()}/mo` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
