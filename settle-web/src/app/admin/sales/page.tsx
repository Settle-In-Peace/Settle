'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearAuth, getStoredToken, getStoredUser } from '@/lib/authUtils';
import PasswordInput from '../../../components/PasswordInput';

import { API_URL } from '@/lib/apiUrl';
interface SalesAgent {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: string;
}

interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  state?: string;
  totalDebt: number;
  debtTypes?: string[];
  qualityScore?: number;
  status?: string;
  createdAt?: string;
  salesAgentId?: string;
}

const DEBT_LABELS: Record<string, string> = {
  credit_card: 'Credit Cards', medical: 'Medical', personal_loan: 'Personal Loans',
  student_loan: 'Student Loans', business: 'Business', other: 'Other',
};

export default function AdminSalesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [newAgent, setNewAgent] = useState({ email: '', password: '', firstName: '', lastName: '', phone: '' });
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const parsed = getStoredUser();
    if (!token || !parsed) { router.push('/login'); return; }
    if (parsed.role !== 'admin') { router.push('/dashboard'); return; }
    setUser(parsed);
    loadData(token);
  }, [router]);

  const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

  const loadData = async (token: string) => {
    try {
      const [agentsRes, leadsRes] = await Promise.all([
        fetch(`${API_URL}/admin/sales-agents`, { headers: authHeaders(token) }).catch(() => null),
        fetch(`${API_URL}/admin/leads?status=new`, { headers: authHeaders(token) }).catch(() => null),
      ]);
      if (agentsRes?.ok) setSalesAgents(await agentsRes.json());
      if (leadsRes?.ok) {
        const data = await leadsRes.json();
        setLeads(Array.isArray(data) ? data : data?.data ?? []);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const createAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/sales-agents`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgent),
      });
      if (!res.ok) throw new Error('Failed to create sales agent');
      setSuccessMsg('Sales agent created.');
      setNewAgent({ email: '', password: '', firstName: '', lastName: '', phone: '' });
      await loadData(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const assignLead = async (leadId: string) => {
    const token = getStoredToken();
    if (!token || !selectedAgent) return;
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/admin/leads/${leadId}/assign-to-sales`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesAgentId: selectedAgent }),
      });
      if (!res.ok) throw new Error('Failed to assign lead');
      setSuccessMsg('Lead assigned to sales agent.');
      setSelectedLead(null);
      await loadData(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };


  if (loading) return <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center text-zinc-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-6">Sales Agents & Lead Assignment</h1>

        {error && <div className="mb-6 border border-red-500/30 bg-red-500/10 rounded-lg p-4 text-red-400 text-sm">{error}</div>}
        {successMsg && <div className="mb-6 border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-4 text-emerald-400 text-sm">{successMsg}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Create sales agent */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Create Sales Agent</h2>
            <form onSubmit={createAgent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="First Name"
                  value={newAgent.firstName}
                  onChange={(e) => setNewAgent({ ...newAgent, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100"
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={newAgent.lastName}
                  onChange={(e) => setNewAgent({ ...newAgent, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100"
                />
              </div>
              <input
                type="email"
                placeholder="Email"
                required
                value={newAgent.email}
                onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100"
              />
              <PasswordInput
                placeholder="Password"
                required
                value={newAgent.password}
                onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={newAgent.phone}
                onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-700 rounded-lg bg-zinc-950 text-zinc-100"
              />
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-500 disabled:opacity-50"
              >
                {actionLoading ? 'Creating...' : 'Create Sales Agent'}
              </button>
            </form>
          </div>

          {/* Sales agents list */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Sales Agents ({salesAgents.length})</h2>
            {salesAgents.length === 0 ? (
              <p className="text-zinc-500 text-sm">No sales agents yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {salesAgents.map(a => (
                  <div key={a.id} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-800">
                    <div className="font-semibold text-zinc-100">{a.firstName} {a.lastName}</div>
                    <div className="text-sm text-zinc-500">{a.email}</div>
                    <div className="text-xs text-zinc-400">{a.phone || '—'} · Created {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lead assignment */}
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-bold text-zinc-100 mb-4">Assign Leads to Sales Agents</h2>
          {leads.length === 0 ? (
            <p className="text-zinc-500 text-sm">No unassigned leads available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/50 text-zinc-500 text-zinc-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-4">Lead</th>
                    <th className="text-left p-4">State</th>
                    <th className="text-right p-4">Debt</th>
                    <th className="text-right p-4">Quality</th>
                    <th className="text-left p-4">Assign To</th>
                    <th className="text-right p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id} className="border-t border-zinc-800/60">
                      <td className="p-4">
                        <div className="font-semibold text-zinc-100">{l.firstName || l.lastName ? `${l.firstName || ''} ${l.lastName || ''}`.trim() : 'Anonymous'}</div>
                        <div className="text-xs text-zinc-400">{l.debtTypes?.map(t => DEBT_LABELS[t] || t).join(', ') || '—'}</div>
                      </td>
                      <td className="p-4 text-zinc-100">{l.state || '—'}</td>
                      <td className="p-4 text-right font-bold text-zinc-100">${Number(l.totalDebt).toLocaleString()}</td>
                      <td className="p-4 text-right">{typeof l.qualityScore === 'number' ? l.qualityScore : '—'}</td>
                      <td className="p-4">
                        <select
                          value={selectedLead === l.id ? selectedAgent : ''}
                          onChange={(e) => { setSelectedLead(l.id); setSelectedAgent(e.target.value); }}
                          className="px-2 py-1 border border-zinc-700 rounded-lg bg-zinc-800 text-zinc-100 text-base"
                        >
                          <option value="">Select agent</option>
                          {salesAgents.map(a => <option key={a.id} value={a.id}>{a.firstName} {a.lastName} ({a.email})</option>)}
                        </select>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => assignLead(l.id)}
                          disabled={!selectedAgent || selectedLead !== l.id || actionLoading}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading && selectedLead === l.id ? 'Assigning...' : 'Assign'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
