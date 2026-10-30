'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAuthenticated } from '@/lib/authUtils';
import {
  MyOrgResponse,
  OrgMember,
  SeatPlan,
  SeatUsageRow,
  addOrgMember,
  createOrg,
  createOrgBillingPortal,
  createSeatCheckout,
  getMyOrg,
  getOrgMembers,
  getSeatPlans,
  getSeatUsage,
  setOrgMemberFlag,
  updateOrgMember,
  OrgPhoneNumber,
  AvailableNumber,
  listNumbers,
  orderNumber,
  releaseNumber,
  searchNumbers,
  updateMyOrg,
  getSkiptraceHistory,
  SkiptraceHistoryRow,
} from '@/lib/org';

function fmtCents(c: number) {
  return (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function OrgDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<MyOrgResponse | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [plans, setPlans] = useState<SeatPlan[]>([]);
  const [usage, setUsage] = useState<SeatUsageRow[]>([]);
  const [totals, setTotals] = useState<{ minutesUsed: number; callsPlaced: number; rpcCount: number; overageMinutes: number } | null>(null);
  const [state, setState] = useState<'loading' | 'member' | 'none'>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [newOrgName, setNewOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [buyPlan, setBuyPlan] = useState('starter');
  const [buySeats, setBuySeats] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [orgRes, memberList, planList, usageRes] = await Promise.all([
        getMyOrg(),
        getOrgMembers().catch(() => [] as OrgMember[]),
        getSeatPlans().catch(() => [] as SeatPlan[]),
        getSeatUsage().catch(() => null),
      ]);
      setOrgMemberFlag(true);
      setData(orgRes);
      setMembers(memberList);
      setPlans(planList);
      if (planList.length && !planList.find((p) => p.code === buyPlan)) {
        setBuyPlan(planList[0].code);
      }
      if (usageRes) {
        setUsage(usageRes.seats);
        setTotals(usageRes.totals);
      }
      setState('member');
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('organization') || msg.includes('membership')) {
        setOrgMemberFlag(false);
        setState('none');
      } else {
        setError(msg || 'Failed to load organization');
        setState('none');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isAuthenticated()) {
      router.push('/login');
      return;
    }
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') setNotice('Checkout complete — seats will appear once the subscription webhook lands.');
    if (checkout === 'cancel') setNotice('Checkout canceled.');
    load();
  }, [router, searchParams, load]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setBusy(true);
    setError('');
    try {
      await createOrg(newOrgName.trim());
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to create organization');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckout = async () => {
    setBusy(true);
    setError('');
    try {
      const { url } = await createSeatCheckout({ planCode: buyPlan, seats: buySeats });
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err?.message || 'Checkout failed — Stripe may not be configured on the API.');
      setBusy(false);
    }
  };

  const handlePortal = async () => {
    setBusy(true);
    setError('');
    try {
      const { url } = await createOrgBillingPortal();
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err?.message || 'Billing portal unavailable — purchase seats first.');
      setBusy(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setError('');
    try {
      await addOrgMember({ email: inviteEmail.trim(), orgRole: inviteRole });
      setInviteEmail('');
      const list = await getOrgMembers();
      setMembers(list);
    } catch (err: any) {
      setError(err?.message || 'Failed to add member');
    } finally {
      setBusy(false);
    }
  };

  const handleSuspendMember = async (m: OrgMember) => {
    setBusy(true);
    setError('');
    try {
      await updateOrgMember(m.id, { status: m.status === 'suspended' ? 'active' : 'suspended' });
      const list = await getOrgMembers();
      setMembers(list);
    } catch (err: any) {
      setError(err?.message || 'Failed to update member');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading organization…</p>
      </div>
    );
  }

  if (state === 'none') {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black py-16 px-4">
        <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Organization</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            DaaS seats are managed per-organization. Create yours — or ask an
            existing org admin to add you as a member.
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
              disabled={busy || !newOrgName.trim()}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create organization'}
            </button>
          </form>
          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  const org = data!.org;
  const isManager = data!.myRole === 'org_owner' || data!.myRole === 'org_manager';
  const plan = data!.plan;
  const pct = org.seatsPurchased > 0 ? Math.min(100, Math.round((data!.seatsUsed / org.seatsPurchased) * 100)) : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{org.name}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {data!.myRole.replace('_', ' ')} · subscription {org.subscriptionStatus || 'none'} · org {org.status}
            </p>
          </div>
          {isManager && org.stripeCustomerId && (
            <button
              onClick={handlePortal}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Manage billing →
            </button>
          )}
        </div>

        {notice && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Seat usage */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-zinc-900 dark:text-white">Seats</h2>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {data!.seatsUsed} of {org.seatsPurchased} used
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-4">
                <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
              </div>
              {usage.length === 0 ? (
                <p className="text-sm text-zinc-500">No seats assigned yet — assign seats from the team view.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="py-2 pr-4">Agent</th>
                        <th className="py-2 pr-4">Tier</th>
                        <th className="py-2 pr-4">Minutes</th>
                        <th className="py-2 pr-4">Calls</th>
                        <th className="py-2 pr-4">RPC</th>
                        <th className="py-2 pr-4">Overage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((u) => {
                        const name = u.user
                          ? `${u.user.firstName ?? ''} ${u.user.lastName ?? ''}`.trim() || u.user.email
                          : '—';
                        const included = u.monthlyMinutesIncluded ?? 0;
                        return (
                          <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800">
                            <td className="py-2 pr-4 text-zinc-900 dark:text-white font-medium">{name}</td>
                            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{u.seatTier}</td>
                            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                              {u.minutesUsed} / {included < 0 ? '∞' : included}
                            </td>
                            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{u.callsPlaced}</td>
                            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{u.rpcCount}</td>
                            <td className="py-2 pr-4">
                              {u.overageMinutes > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400 font-medium">+{u.overageMinutes}m</span>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {totals && (
                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                      This period: {totals.minutesUsed} min · {totals.callsPlaced} calls ·{' '}
                      {totals.rpcCount} RPC{totals.overageMinutes > 0 ? ` · ${totals.overageMinutes} overage min` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Members */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
              <h2 className="font-semibold text-zinc-900 dark:text-white mb-4">Members</h2>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 mb-4">
                {members.map((m) => (
                  <li key={m.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-zinc-900 dark:text-white">
                        {m.user ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim() || m.user.email : m.userId.slice(0, 8)}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {m.orgRole.replace('_', ' ')}{m.status !== 'active' ? ` · ${m.status}` : ''}
                      </span>
                    </div>
                    {isManager && m.orgRole !== 'org_owner' && (
                      <button
                        onClick={() => handleSuspendMember(m)}
                        disabled={busy}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        {m.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {isManager && (
                <form onSubmit={handleInvite} className="flex flex-wrap gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="agent@agency.com (must be registered)"
                    className="flex-1 min-w-[220px] px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  >
                    <option value="agent">Agent</option>
                    <option value="org_manager">Manager</option>
                  </select>
                  <button
                    type="submit"
                    disabled={busy || !inviteEmail.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Add member
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Plan + buy seats */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
              <h2 className="font-semibold text-zinc-900 dark:text-white mb-2">Plan</h2>
              {plan ? (
                <>
                  <p className="text-lg font-bold text-zinc-900 dark:text-white">
                    {plan.name} <span className="text-sm font-normal text-zinc-500">{fmtCents(plan.priceCents)}/seat/mo</span>
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {plan.includedMinutes < 0 ? 'Unlimited' : plan.includedMinutes} included minutes per seat
                    {plan.overagePerMinCents > 0 ? ` · ${fmtCents(plan.overagePerMinCents)}/overage min` : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-500">No plan purchased yet.</p>
              )}
            </div>

            <PhoneNumbersCard isManager={isManager} />
            <SkiptraceCard isOwner={data!.myRole === 'org_owner'} initialKey={data!.org?.skiptraceKey} />

            {isManager && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-blue-200 dark:border-blue-800 p-5">
                <h2 className="font-semibold text-zinc-900 dark:text-white mb-3">Buy seats</h2>
                <div className="space-y-3">
                  <select
                    value={buyPlan}
                    onChange={(e) => setBuyPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                  >
                    {plans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} — {fmtCents(p.priceCents)}/seat/mo ({p.includedMinutes < 0 ? 'unlimited' : `${p.includedMinutes} min`})
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-zinc-600 dark:text-zinc-400">Seats</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={buySeats}
                      onChange={(e) => setBuySeats(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      className="w-24 px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base"
                    />
                  </div>
                  {plans.find((p) => p.code === buyPlan)?.features?.length ? (
                    <ul className="text-xs text-zinc-500 dark:text-zinc-400 list-disc pl-4 space-y-0.5">
                      {plans.find((p) => p.code === buyPlan)!.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    onClick={handleCheckout}
                    disabled={busy}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {busy ? 'Redirecting…' : `Checkout — ${fmtCents((plans.find((p) => p.code === buyPlan)?.priceCents ?? 0) * buySeats)}/mo`}
                  </button>
                  <p className="text-[11px] text-zinc-400">
                    Per-seat subscription billed monthly via Stripe. Usage overage is invoiced per the plan rate.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrgDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
          <p className="text-sm text-zinc-500">Loading organization…</p>
        </div>
      }
    >
      <OrgDashboardContent />
    </Suspense>
  );
}


function PhoneNumbersCard({ isManager }: { isManager: boolean }) {
  const [numbers, setNumbers] = useState<OrgPhoneNumber[]>([]);
  const [prefix, setPrefix] = useState('');
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setNumbers(await listNumbers());
    } catch {
      /* not configured yet */
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doSearch = async () => {
    setBusy(true); setError('');
    try {
      setResults(await searchNumbers(prefix));
    } catch (e: any) {
      setError(e?.message || 'Search failed');
    } finally {
      setBusy(false);
    }
  };

  const doOrder = async (phoneNumber: string) => {
    setBusy(true); setError('');
    try {
      await orderNumber(phoneNumber);
      setResults(results.filter((r) => r.phoneNumber !== phoneNumber));
      await load();
    } catch (e: any) {
      setError(e?.message || 'Order failed');
    } finally {
      setBusy(false);
    }
  };

  const doRelease = async (id: string) => {
    setBusy(true); setError('');
    try {
      await releaseNumber(id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Release failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
      <h2 className="font-semibold text-zinc-900 dark:text-white mb-1">Phone numbers</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        Numbers your org owns — used as caller IDs on outbound dials.
      </p>

      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}

      {numbers.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {numbers.map((n) => (
            <li key={n.id} className="flex items-center justify-between text-sm">
              <span className="font-mono text-zinc-900 dark:text-zinc-100">{n.phoneNumber}</span>
              <span className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase ${n.status === 'active' ? 'text-emerald-600' : 'text-zinc-400'}`}>{n.status}</span>
                {isManager && n.status === 'active' && (
                  <button onClick={() => doRelease(n.id)} disabled={busy} className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50">Release</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-400 mb-4">No numbers yet — orders use the platform account until then.</p>
      )}

      {isManager && (
        <>
          <div className="flex gap-2">
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="Area code — e.g. 951"
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
            />
            <button onClick={doSearch} disabled={busy || !prefix.trim()} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
              {busy ? '…' : 'Search'}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {results.map((r) => (
                <li key={r.phoneNumber} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    {r.phoneNumber}
                    {r.locality && <span className="ml-2 text-xs text-zinc-400">{r.locality}{r.region ? `, ${r.region}` : ''}</span>}
                  </span>
                  <button onClick={() => doOrder(r.phoneNumber)} disabled={busy} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium disabled:opacity-50">
                    Buy
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SkiptraceCard({ isOwner, initialKey }: { isOwner: boolean; initialKey?: string | null }) {
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(!!initialKey);
  const [history, setHistory] = useState<SkiptraceHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getSkiptraceHistory().then(setHistory).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      await updateMyOrg({ skiptraceKey: key });
      setHasKey(!!key); setKey('');
      setMsg(key ? 'Vendor key saved — lookups bill to your account.' : 'Reverted to platform metering.');
    } catch (e: any) { setMsg(e?.message || 'Save failed'); }
    finally { setBusy(false); }
  };

  const platform = history.filter((h) => !h.vendor.startsWith('byok:'));
  const platformCost = platform.reduce((a, h) => a + Number(h.costUsd || 0), 0);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Skip Trace</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {hasKey ? 'Using your own vendor key — lookups bill to your account.' : 'Platform account — lookups metered to this org.'}
          </p>
        </div>
        <span className={"text-[10px] px-2 py-0.5 rounded-full border " + (hasKey ? 'border-emerald-800 text-emerald-400' : 'border-zinc-700 text-zinc-400')}>
          {hasKey ? 'BYOK' : 'Platform'}
        </span>
      </div>
      {isOwner && (
        <div className="flex gap-2">
          <input value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={hasKey ? 'Enter new vendor key (blank clears)' : 'Vendor API key (optional)'}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
          <button onClick={save} disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? '…' : 'Save'}
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-zinc-400">{msg}</p>}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-lg font-semibold text-zinc-100">{history.length}</p>
          <p className="text-[10px] text-zinc-500">Lookups</p>
        </div>
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-lg font-semibold text-zinc-100">{history.reduce((a, h) => a + (h.matchCount || 0), 0)}</p>
          <p className="text-[10px] text-zinc-500">Phones found</p>
        </div>
        <div className="rounded-lg border border-zinc-800 p-3">
          <p className="text-lg font-semibold text-zinc-100">${platformCost.toFixed(2)}</p>
          <p className="text-[10px] text-zinc-500">Platform cost</p>
        </div>
      </div>
    </div>
  );
}
