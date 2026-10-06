'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listQuestions, askQuestion, QaCategory, QaQuestionSummary } from './api';

const CATEGORY_LABELS: Record<QaCategory, string> = {
  probate: 'Probate',
  debts: 'Debts',
  taxes: 'Taxes',
  property: 'Property',
  family: 'Family',
  other: 'Other',
};

const FILTERS: { value: '' | QaCategory; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'probate', label: 'Probate' },
  { value: 'debts', label: 'Debts' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'property', label: 'Property' },
  { value: 'family', label: 'Family' },
  { value: 'other', label: 'Other' },
];

export default function QuestionsPage() {
  const [items, setItems] = useState<QaQuestionSummary[]>([]);
  const [filter, setFilter] = useState<'' | QaCategory>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ask-anonymously form
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<QaCategory>('probate');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [asked, setAsked] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listQuestions(filter || undefined)
      .then(setItems)
      .catch(() => setError('Could not load questions. Please try again.'))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (body.trim().length < 3) {
      setFormError('Please write a little more about your question.');
      return;
    }
    setSubmitting(true);
    try {
      const q = await askQuestion({
        body: body.trim(),
        category,
        contactEmail: contactEmail.trim() || undefined,
      });
      setAsked(true);
      setBody('');
      setContactEmail('');
      setItems(prev => [q, ...prev]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not post your question. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
          ← Back to home
        </Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">
          Questions about settling an estate
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          Anonymous. Your question is public; your identity is not.
          No account needed — ask, and the community (and our team) will answer.
        </p>

        {/* Ask anonymously */}
        <form
          onSubmit={handleAsk}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-10 space-y-3"
        >
          <label htmlFor="qa-body" className="block font-semibold text-black dark:text-white">
            Ask a question
          </label>
          <textarea
            id="qa-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="e.g. My mother passed away with credit card debt — am I responsible for paying it?"
            required
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={category}
              onChange={e => setCategory(e.target.value as QaCategory)}
              aria-label="Question category"
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(CATEGORY_LABELS) as QaCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="Email (optional — only if you want a private follow-up)"
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          {asked && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Posted — your question is live below.
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Anonymous. Your question is public; your identity is not.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 text-white text-sm font-semibold px-5 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Posting…' : 'Ask anonymously'}
            </button>
          </div>
        </form>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-6">
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
            <p className="text-zinc-600 dark:text-zinc-400">No questions yet — yours can be the first.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map(q => (
              <li key={q.id}>
                <Link
                  href={`/questions/${q.id}`}
                  className="block rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                >
                  <p className="text-black dark:text-white font-medium line-clamp-2">
                    {q.body}
                  </p>
                  <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {CATEGORY_LABELS[q.category] ?? q.category}
                    </span>
                    <span>Anonymous</span>
                    <span>·</span>
                    <span>{q.answersCount} {q.answersCount === 1 ? 'answer' : 'answers'}</span>
                    {q.status === 'answered' && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Answered by our team</span>
                      </>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
