'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';
import {
  getModerationQueue,
  updateQuestionStatus,
  updateAnswer,
  ModerationQueue,
  QaQuestionSummary,
  PendingAnswer,
} from '@/app/questions/api';

/**
 * Staff Q&A moderation — pending questions and community answers appear
 * here until a reviewer publishes or hides them. Listing is staff
 * (admin/sales); approve/reject actions are admin-only server-side.
 */
export default function AdminQuestionsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (!token || !user) {
      router.push('/login');
      return;
    }
    const parsed = typeof user === 'string' ? JSON.parse(user) : user;
    if (parsed.role !== 'admin' && parsed.role !== 'sales') {
      router.push('/dashboard');
      return;
    }
    setIsAdmin(parsed.role === 'admin');
    setReady(true);
  }, [router]);

  const load = useCallback(() => {
    setError('');
    getModerationQueue()
      .then(setQueue)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load the moderation queue'),
      );
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const patch = async (key: string, fn: () => Promise<unknown>) => {
    setBusyId(key);
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} — approve/reject requires an admin account.`
          : 'Action failed — approve/reject requires an admin account.',
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return null;

  const questions = queue?.questions ?? [];
  const answers = queue?.answers ?? [];

  const ActionButtons = ({
    id,
    onApprove,
    onReject,
  }: {
    id: string;
    onApprove: () => Promise<unknown>;
    onReject: () => Promise<unknown>;
  }) => (
    <div className="flex shrink-0 gap-2">
      <button
        onClick={() => patch(`${id}-approve`, onApprove)}
        disabled={busyId !== null || !isAdmin}
        title={isAdmin ? undefined : 'Requires an admin account'}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busyId === `${id}-approve` ? '…' : 'Approve'}
      </button>
      <button
        onClick={() => patch(`${id}-reject`, onReject)}
        disabled={busyId !== null || !isAdmin}
        title={isAdmin ? undefined : 'Requires an admin account'}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busyId === `${id}-reject` ? '…' : 'Reject'}
      </button>
    </div>
  );

  const QuestionRow = ({ q }: { q: QaQuestionSummary }) => (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="min-w-0">
        <p className="text-sm text-zinc-100 whitespace-pre-line">{q.body}</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 capitalize">{q.category}</span>
          <span>{new Date(q.createdAt).toLocaleString()}</span>
        </p>
      </div>
      <ActionButtons
        id={q.id}
        onApprove={() => updateQuestionStatus(q.id, 'published')}
        onReject={() => updateQuestionStatus(q.id, 'hidden')}
      />
    </div>
  );

  const AnswerRow = ({ a }: { a: PendingAnswer }) => (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-sm text-zinc-100 whitespace-pre-line">{a.body}</p>
        <ActionButtons
          id={a.id}
          onApprove={() => updateAnswer(a.questionId, a.id, { status: 'published' })}
          onReject={() => updateAnswer(a.questionId, a.id, { status: 'hidden' })}
        />
      </div>
      <div className="mt-3 rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">On question</p>
        <p className="mt-1 text-xs text-zinc-400 whitespace-pre-line">{a.questionBody}</p>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{new Date(a.createdAt).toLocaleString()}</p>
    </div>
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Q&amp;A Moderation</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Questions and community answers appear publicly only after review.
            {!isAdmin && ' Viewing is staff-wide; approve/reject requires an admin account.'}
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!queue && !error && <p className="text-sm text-zinc-500">Loading moderation queue…</p>}

      {queue && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">
              Pending questions <span className="text-zinc-500">({questions.length})</span>
            </h2>
            {questions.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">
                Nothing awaiting review.
              </p>
            ) : (
              <div className="space-y-3">
                {questions.map((q) => (
                  <QuestionRow key={q.id} q={q} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">
              Pending answers <span className="text-zinc-500">({answers.length})</span>
            </h2>
            {answers.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">
                Nothing awaiting review.
              </p>
            ) : (
              <div className="space-y-3">
                {answers.map((a) => (
                  <AnswerRow key={a.id} a={a} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
