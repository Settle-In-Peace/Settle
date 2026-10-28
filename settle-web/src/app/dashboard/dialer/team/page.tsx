'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, isAuthenticated } from '@/lib/authUtils';
import { TeamAgentStats, getDialerTeamStats } from '@/lib/dialer';
import {
  OrgMember,
  Seat,
  assignSeat,
  getOrgMembers,
  getSeats,
  releaseSeat,
  setOrgMemberFlag,
  updateSeat,
} from '@/lib/org';

interface LiveCall {
  id: string;
  agentId?: string;
  agentName?: string;
  phoneNumber: string;
  status: string;
  startedAt?: string;
  createdAt: string;
}

export default function TeamDialerPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<TeamAgentStats[]>([]);
  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busySeat, setBusySeat] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [team, seatList, memberList] = await Promise.all([
        getDialerTeamStats(),
        getSeats().catch(() => [] as Seat[]),
        getOrgMembers().catch(() => [] as OrgMember[]),
      ]);
      setOrgMemberFlag(true);
      setAgents(team?.agents || []);
      setLiveCalls(team?.liveCalls || []);
      setSeats(seatList);
      setMembers(memberList);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('org role') || msg.includes('membership')) {
        setError('Manager or owner org role required for the team view.');
      } else {
        setError(msg || 'Failed to load team stats');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isAuthenticated()) {
      router.push('/login');
      return;
    }
    getStoredUser();
    load();
  }, [router, load]);

  const seatFor = (userId: string) =>
    seats.find((s) => s.userId === userId && s.status !== 'released');

  const handleAssign = async (userId: string) => {
    setBusySeat(userId);
    setError('');
    try {
      await assignSeat({ userId });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to assign seat');
    } finally {
      setBusySeat(null);
    }
  };

  const handleSuspend = async (seat: Seat) => {
    setBusySeat(seat.id);
    setError('');
    try {
      await updateSeat(seat.id, { status: seat.status === 'suspended' ? 'active' : 'suspended' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update seat');
    } finally {
      setBusySeat(null);
    }
  };

  const handleRelease = async (seat: Seat) => {
    if (!confirm('Release this seat? The agent loses dialer access immediately.')) return;
    setBusySeat(seat.id);
    setError('');
    try {
      await releaseSeat(seat.id);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to release seat');
    } finally {
      setBusySeat(null);
    }
  };

  const nameFor = (a: TeamAgentStats) =>
    `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.email || a.userId.slice(0, 8);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Team Dialer</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Per-seat performance, live calls, and seat management.
            </p>
          </div>
          <Link href="/dashboard/dialer" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            ← Agent view
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Live calls */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-6">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-900 dark:text-white">
              Live calls
              {liveCalls.length > 0 && (
                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </h2>
            <button onClick={load} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Refresh
            </button>
          </div>
          {liveCalls.length === 0 ? (
            <p className="px-5 py-4 text-sm text-zinc-500">No calls in flight.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {liveCalls.map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-zinc-900 dark:text-white">{c.agentName || 'Agent'}</span>
                    <span className="text-zinc-500 dark:text-zinc-400"> → {c.phoneNumber}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Per-seat stats */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Agent performance</h2>
          </div>
          {loading ? (
            <p className="p-5 text-sm text-zinc-500">Loading…</p>
          ) : agents.length === 0 ? (
            <p className="p-5 text-sm text-zinc-500">No active org members.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Seat</th>
                    <th className="px-4 py-3">Today</th>
                    <th className="px-4 py-3">This week</th>
                    <th className="px-4 py-3">Dispositions (7d)</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const seat = seatFor(a.userId);
                    const dispos = Object.entries(a.week.dispositions || {});
                    return (
                      <tr key={a.userId} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900 dark:text-white">{nameFor(a)}</div>
                          <div className="text-xs text-zinc-500">{a.orgRole.replace('_', ' ')}</div>
                        </td>
                        <td className="px-4 py-3">
                          {seat ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              seat.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}>
                              {seat.seatTier} · {seat.status}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">no seat</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {a.today.calls} calls · {a.today.answered} ans · {a.today.avgDurationSeconds}s
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                          {a.week.calls} calls · {a.week.answered} ans
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 max-w-[220px]">
                          {dispos.length
                            ? dispos.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end">
                            {!seat && (
                              <button
                                onClick={() => handleAssign(a.userId)}
                                disabled={busySeat === a.userId}
                                className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                Assign seat
                              </button>
                            )}
                            {seat && seat.status !== 'released' && (
                              <>
                                <button
                                  onClick={() => handleSuspend(seat)}
                                  disabled={busySeat === seat.id}
                                  className="px-3 py-1 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                                >
                                  {seat.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                                </button>
                                <button
                                  onClick={() => handleRelease(seat)}
                                  disabled={busySeat === seat.id}
                                  className="px-3 py-1 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                                >
                                  Release
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Members without seats */}
        {members.length > 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {members.length} org member{members.length === 1 ? '' : 's'} ·{' '}
            {seats.filter((s) => s.status === 'active').length} active seat
            {seats.filter((s) => s.status === 'active').length === 1 ? '' : 's'} · manage billing on the{' '}
            <Link href="/dashboard/org" className="text-blue-600 dark:text-blue-400 hover:underline">
              organization page
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
