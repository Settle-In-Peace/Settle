'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getQuestion, answerQuestion, QaQuestionDetail } from '../api';
import { isAuthenticated } from '@/lib/authUtils';

export default function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [question, setQuestion] = useState<QaQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [body, setBody] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [formError, setFormError] = useState('');

  const authed = isAuthenticated();

  useEffect(() => {
    getQuestion(id)
      .then(setQuestion)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleAnswer(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!body.trim()) {
      setFormError('Please write your answer first.');
      return;
    }
    if (!authed && !contactEmail.trim()) {
      setFormError('Please leave an email to answer anonymously — it is never shown publicly.');
      return;
    }
    setSubmitting(true);
    try {
      const a = await answerQuestion(id, {
        body: body.trim(),
        contactEmail: contactEmail.trim() || undefined,
      });
      setAnswered(true);
      setBody('');
      setContactEmail('');
      setQuestion(prev =>
        prev
          ? {
              ...prev,
              answersCount: prev.answersCount + 1,
              answers: [...prev.answers, a],
            }
          : prev,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not post your answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (notFound || !question) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <Link href="/questions" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
            ← All questions
          </Link>
          <h1 className="text-2xl font-bold text-black dark:text-white mb-2">Question not found</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            It may have been removed.{' '}
            <Link href="/questions" className="text-blue-600 hover:underline">
              Browse other questions
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/questions" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
          ← All questions
        </Link>

        {/* Question */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-8">
          <p className="text-lg text-black dark:text-white whitespace-pre-line">{question.body}</p>
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 capitalize">
              {question.category}
            </span>
            <span>Asked anonymously</span>
            <span>·</span>
            <span>{new Date(question.createdAt).toLocaleDateString()}</span>
          </p>
        </div>

        {/* Answers */}
        <h2 className="text-xl font-bold text-black dark:text-white mb-4">
          {question.answers.length} {question.answers.length === 1 ? 'answer' : 'answers'}
        </h2>
        {question.answers.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400 mb-8">
            No answers yet — if you&apos;ve been through this, your experience could help.
          </p>
        ) : (
          <ul className="space-y-4 mb-8">
            {question.answers.map(a => (
              <li
                key={a.id}
                className={`rounded-xl border p-5 ${
                  a.isOfficial
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <p className="text-black dark:text-white whitespace-pre-line">{a.body}</p>
                <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-2">
                  {a.isOfficial ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                      ✓ {a.authorLabel} — verified answer
                    </span>
                  ) : (
                    <span>{a.authorLabel}</span>
                  )}
                  <span>·</span>
                  <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Answer form */}
        <form
          onSubmit={handleAnswer}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3"
        >
          <label htmlFor="qa-answer" className="block font-semibold text-black dark:text-white">
            Share what you know
          </label>
          <textarea
            id="qa-answer"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Your answer — general information only, not legal advice."
            required
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          {!authed && (
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="Email (required to answer anonymously — never shown)"
              required
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          {answered && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Posted — thank you.</p>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Answers are community guidance, not legal advice.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 text-white text-sm font-semibold px-5 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Posting…' : 'Post answer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
