'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listFeatureRequests,
  voteFeatureRequest,
  getVoterId,
  getVotedIds,
  setVotedFlag,
  FeatureRequest,
  FeatureRequestStatus,
} from './api';

const STATUS_META: Record<FeatureRequestStatus, { label: string; className: string }> = {
  under_review: { label: 'Under review', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  planned: { label: 'Planned', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  in_progress: { label: 'In progress', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  shipped: { label: 'Shipped', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' },
};

const FILTERS: { value: '' | FeatureRequestStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'under_review', label: 'Under review' },
];

export default function RoadmapPage() {
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [filter, setFilter] = useState<'' | FeatureRequestStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [pendingVote, setPendingVote] = useState<string | null>(null);

  useEffect(() => {
    setVoted(getVotedIds());
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    listFeatureRequests(filter || undefined)
      .then(setItems)
      .catch(() => setError('Could not load the roadmap. Please try again.'))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleVote(id: string) {
    if (pendingVote) return;
    setPendingVote(id);
    try {
      const res = await voteFeatureRequest(id, getVoterId());
      setVotedFlag(id, res.voted);
      setVoted(getVotedIds());
      setItems(prev =>
        prev.map(r => (r.id === id ? { ...r, votes: res.votes } : r)),
      );
    } catch {
      setError('Your vote could not be recorded. Please try again.');
    } finally {
      setPendingVote(null);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
          ← Back to home
        </Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">
          Product roadmap
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-2">
          What we&apos;re building, what&apos;s shipped, and what you&apos;ve asked for.
          Vote on the ideas that matter to you — or suggest one with the Feedback button.
        </p>
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-8">
          Looking for help settling an estate?{' '}
          <Link href="/questions" className="text-blue-600 hover:underline">
            Ask a question anonymously →
          </Link>
        </p>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <p className="text-zinc-600 dark:text-zinc-400 mb-2">No requests here yet.</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Use the Feedback button (bottom-right) to suggest the first one.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map(item => {
              const meta = STATUS_META[item.status] ?? STATUS_META.under_review;
              const hasVoted = voted.has(item.id);
              return (
                <li
                  key={item.id}
                  className="flex gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5"
                >
                  <button
                    onClick={() => handleVote(item.id)}
                    disabled={pendingVote === item.id}
                    aria-pressed={hasVoted}
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border font-semibold transition-colors flex-shrink-0 ${
                      hasVoted
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    <span className="text-lg leading-none">▲</span>
                    <span className="text-sm">{item.votes}</span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-black dark:text-white">
                        {item.title}
                      </h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>
                    {item.body && (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                      {item.authorName} · {new Date(item.createdAt).toLocaleDateString()}
                      {item.category !== 'general' && <> · {item.category}</>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
