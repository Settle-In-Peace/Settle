'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, isAuthenticated } from '@/lib/authUtils';
import {
  DialerCall,
  QueueItem,
  getDialerCall,
  getDialerMyStats,
  getDialerQueue,
  getDialerStatus,
  getNextAction,
  hangupDialerCall,
  placeDialerCall,
  setDialerCallDisposition,
} from '@/lib/dialer';
import { createOrg, getMyOrg, setOrgMemberFlag } from '@/lib/org';

const IN_FLIGHT = new Set(['queued', 'dialing', 'ringing', 'answered']);

const DISPOSITIONS: { code: string; label: string }[] = [
  { code: 'rpc', label: 'Right party contact' },
  { code: 'promise_to_pay', label: 'Promise to pay' },
  { code: 'settlement', label: 'Settlement reached' },
  { code: 'negotiation', label: 'Negotiating' },
  { code: 'callback', label: 'Call back later' },
  { code: 'no_contact', label: 'No contact / voicemail' },
  { code: 'wrong_number', label: 'Wrong number' },
  { code: 'dispute', label: 'Disputes debt' },
  { code: 'refused', label: 'Refused to pay' },
  { code: 'dnc_request', label: 'Requested DNC' },
  { code: 'deceased', label: 'Deceased' },
  { code: 'other', label: 'Other' },
];

function fmtMoney(n?: number) {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtAgo(iso?: string) {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentDialerPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [orgState, setOrgState] = useState<'loading' | 'member' | 'none'>('loading');
  const [orgName, setOrgName] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<{ calls: number; answered: number; avgDurationSeconds: number } | null>(null);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [script, setScript] = useState<{ action?: string; snippet?: string; reason?: string; degraded?: boolean } | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);

  const [consentChecked, setConsentChecked] = useState(false);
  const [activeCall, setActiveCall] = useState<DialerCall | null>(null);
  const [dialing, setDialing] = useState(false);
  const [dispoNotes, setDispoNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [queue, myStats, status] = await Promise.all([
        getDialerQueue(),
        getDialerMyStats().catch(() => null),
        getDialerStatus().catch(() => null),
      ]);
      setItems(queue?.items || []);
      if (myStats) setStats(myStats.today);
      const active = status?.providers.find((p) => p.name === status.activeProvider);
      setProviderConfigured(!!active?.configured);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dialer queue');
    } finally {
      setLoading(false);
    }
  }, []);

  // Org bootstrap — membership is the tenant boundary for the DaaS dialer.
  useEffect(() => {
    if (typeof window !== 'undefined' && !isAuthenticated()) {
      router.push('/login');
      return;
    }
    const parsed = getStoredUser();
    setUser(parsed);
    (async () => {
      try {
        const org = await getMyOrg();
        setOrgMemberFlag(true);
        setOrgName(org.org.name);
        setOrgState('member');
        await load();
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('organization') || msg.includes('membership') || msg.includes('Forbidden') || msg.includes('403')) {
          setOrgMemberFlag(false);
          setOrgState('none');
        } else {
          // Unknown error — still try the queue (platform sales/admin may dial w/o org).
          setOrgState('member');
          await load();
        }
        setLoading(false);
      }
    })();
  }, [router, load]);

  // Poll the in-flight call status while a call is live.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeCall || !IN_FLIGHT.has(activeCall.status)) return;
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await getDialerCall(activeCall.id);
        setActiveCall(fresh);
      } catch {
        /* keep polling — transient failures shouldn't drop the call card */
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeCall]);

  const selectItem = async (item: QueueItem) => {
    setSelected(item);
    setScript(null);
    setDispoNotes('');
    if (item.type === 'account') {
      setScriptLoading(true);
      try {
        const res = await getNextAction(item.id);
        setScript({ action: res.action, snippet: res.scriptSnippet, reason: res.reason });
      } catch {
        setScript({ degraded: true });
      } finally {
        setScriptLoading(false);
      }
    }
  };

  const handleDial = async () => {
    if (!selected?.phone) {
      setError('Select a contact with a phone number first.');
      return;
    }
    if (selected.compliance.blocked) {
      setError(`Call blocked: ${selected.compliance.reasons.join(', ')}`);
      return;
    }
    if (!consentChecked) {
      setError('Confirm TCPA consent attestation before dialing.');
      return;
    }
    setDialing(true);
    setError('');
    try {
      const call = await placeDialerCall({
        to: selected.phone,
        contactId: selected.clientId,
        collectionAccountId: selected.type === 'account' ? selected.id : undefined,
        consentConfirmed: true,
        manualDial: true,
      });
      setActiveCall(call);
      setConsentChecked(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to place call');
    } finally {
      setDialing(false);
    }
  };

  const handleHangup = async () => {
    if (!activeCall) return;
    try {
      const done = await hangupDialerCall(activeCall.id);
      setActiveCall(done);
    } catch (err: any) {
      setError(err?.message || 'Failed to hang up');
    }
  };

  const handleDisposition = async (code: string) => {
    if (!activeCall) return;
    try {
      const done = await setDialerCallDisposition(activeCall.id, code, dispoNotes || undefined);
      setActiveCall(null);
      setDispoNotes('');
      await load();
      void done;
    } catch (err: any) {
      setError(err?.message || 'Failed to save disposition');
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    setError('');
    try {
      await createOrg(newOrgName.trim());
      const org = await getMyOrg();
      setOrgMemberFlag(true);
      setOrgName(org.org.name);
      setOrgState('member');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to create organization');
    } finally {
      setCreatingOrg(false);
    }
  };

  const comp = selected?.compliance;
  const callEnded = activeCall && !IN_FLIGHT.has(activeCall.status);

  const complianceBanner = useMemo(() => {
    if (!comp) return null;
    if (comp.blocked) {
      return {
        cls: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
        text: `DO NOT CALL — ${comp.reasons.join(' · ')}`,
      };
    }
    const warns: string[] = [];
    if (!comp.consentOnFile) warns.push('no stored TCPA consent — manual dial only');
    if (comp.fdcpa.status === 'outside') warns.push('outside 8am–9pm consumer local time');
    if (comp.fdcpa.status === 'unknown') warns.push('consumer timezone unknown — confirm local time is 8am–9pm');
    if (warns.length) {
      return {
        cls: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
        text: `CAUTION — ${warns.join(' · ')}`,
      };
    }
    return {
      cls: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
      text: 'Clear to call — consent on file, within FDCPA window, not on DNC.',
    };
  }, [comp]);

  if (orgState === 'none') {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black py-16 px-4">
        <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Agent Dialer</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            {user?.firstName ? `${user.firstName}, you` : 'You'} don&apos;t belong to an organization yet.
            Ask your org admin for a seat — or create your agency workspace below.
          </p>
          <form onSubmit={handleCreateOrg} className="space-y-3">
            <input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Agency / firm name"
              className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base"
            />
            <button
              type="submit"
              disabled={creatingOrg || !newOrgName.trim()}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {creatingOrg ? 'Creating…' : 'Create organization'}
            </button>
          </form>
          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Agent Dialer</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {orgName || 'Workspace'} · manual click-to-call · every call is consent- and DNC-checked
            </p>
          </div>
          <div className="flex items-center gap-4">
            {stats && (
              <div className="flex gap-3 text-center">
                <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-lg font-bold text-zinc-900 dark:text-white">{stats.calls}</div>
                  <div className="text-[10px] uppercase text-zinc-500">calls today</div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-lg font-bold text-emerald-600">{stats.answered}</div>
                  <div className="text-[10px] uppercase text-zinc-500">answered</div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-lg font-bold text-zinc-900 dark:text-white">{stats.avgDurationSeconds}s</div>
                  <div className="text-[10px] uppercase text-zinc-500">avg talk</div>
                </div>
              </div>
            )}
            <Link
              href="/dashboard/dialer/team"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Team view →
            </Link>
          </div>
        </div>

        {providerConfigured === false && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
            Dialer provider isn&apos;t configured on the API — calls will fail until{' '}
            <code>TELNYX_*</code> or <code>VICIDIAL_*</code> env vars are set. The queue and stats still work.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Queue */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900 dark:text-white">Call queue</h2>
              <button onClick={load} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Refresh
              </button>
            </div>
            {loading ? (
              <p className="p-5 text-sm text-zinc-500">Loading queue…</p>
            ) : items.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">
                No assigned accounts or leads — ask your manager to assign collection accounts to you.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Compliance</th>
                      <th className="px-4 py-3">Last contact</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={`${item.type}-${item.id}`}
                        onClick={() => selectItem(item)}
                        className={`border-b border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors ${
                          selected?.id === item.id
                            ? 'bg-blue-50 dark:bg-blue-950/40'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900 dark:text-white">{item.name}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {item.phone || 'no phone'} · {item.type === 'account' ? `acct · ${item.status}` : `lead · ${item.status}`}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{fmtMoney(item.balance)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.compliance.dnc || item.compliance.doNotCall ? (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">DNC</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">callable</span>
                            )}
                            {item.compliance.consentOnFile && (
                              <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">consent</span>
                            )}
                            {item.compliance.fdcpa.status === 'outside' && (
                              <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">off-hours</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">{fmtAgo(item.lastContactAt)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectItem(item);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Work
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right rail: live call + compliance + script + dispositions */}
          <div className="space-y-4">
            {/* Live call card */}
            {activeCall && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-blue-200 dark:border-blue-800 p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-zinc-900 dark:text-white">Live call</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    IN_FLIGHT.has(activeCall.status)
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}>
                    {activeCall.status}
                  </span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{activeCall.phoneNumber}</p>
                {activeCall.duration != null && (
                  <p className="text-xs text-zinc-500 mt-1">{activeCall.duration}s talk time</p>
                )}
                {IN_FLIGHT.has(activeCall.status) ? (
                  <button
                    onClick={handleHangup}
                    className="mt-3 w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                  >
                    Hang up
                  </button>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase">Disposition</p>
                    <textarea
                      value={dispoNotes}
                      onChange={(e) => setDispoNotes(e.target.value)}
                      placeholder="Call notes (optional)"
                      rows={2}
                      className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {DISPOSITIONS.map((d) => (
                        <button
                          key={d.code}
                          onClick={() => handleDisposition(d.code)}
                          className="px-2.5 py-1 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Selected account panel */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
              <h3 className="font-semibold text-zinc-900 dark:text-white mb-3">
                {selected ? selected.name : 'Select a contact'}
              </h3>

              {complianceBanner && (
                <div className={`mb-4 p-3 rounded-lg border text-xs font-medium ${complianceBanner.cls}`}>
                  {complianceBanner.text}
                </div>
              )}

              {selected && (
                <div className="space-y-3">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                    <p>Phone: <span className="font-medium text-zinc-900 dark:text-white">{selected.phone || '—'}</span></p>
                    {selected.balance != null && <p>Balance: <span className="font-medium text-zinc-900 dark:text-white">{fmtMoney(selected.balance)}</span></p>}
                    {selected.delinquencyDays != null && <p>Days delinquent: {selected.delinquencyDays}</p>}
                  </div>

                  {!selected.compliance.blocked && (
                    <>
                      <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <input
                          type="checkbox"
                          checked={consentChecked}
                          onChange={(e) => setConsentChecked(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          The contact has provided express consent to be called and is not on a
                          Do-Not-Call list (TCPA). Attestation is recorded on the call log.
                        </span>
                      </label>
                      <button
                        onClick={handleDial}
                        disabled={dialing || !selected.phone || !consentChecked || !!activeCall}
                        className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                      >
                        {dialing ? 'Dialing…' : `Call ${selected.phone || ''}`}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Script pane — collection-ai next-action */}
              {selected?.type === 'account' && (
                <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase mb-2">AI script assist</p>
                  {scriptLoading ? (
                    <p className="text-xs text-zinc-500">Drafting suggestions…</p>
                  ) : script?.degraded ? (
                    <p className="text-xs text-zinc-500">AI assist unavailable — no model configured.</p>
                  ) : script ? (
                    <div className="space-y-2">
                      {script.action && (
                        <p className="text-xs">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Suggested: {script.action}</span>{' '}
                          <span className="text-zinc-500">{script.reason}</span>
                        </p>
                      )}
                      {script.snippet && (
                        <pre className="text-xs whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-950 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
                          {script.snippet}
                        </pre>
                      )}
                      <p className="text-[10px] text-zinc-400">Advisory draft — review before speaking. Mini-Miranda disclosure required on first contact.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Select an account to see the suggested opener.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {callEnded && null}
      </div>
    </div>
  );
}
