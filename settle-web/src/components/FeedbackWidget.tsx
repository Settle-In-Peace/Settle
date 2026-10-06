'use client';

import { useState } from 'react';
import Link from 'next/link';
import { submitFeatureRequest } from '../app/roadmap/api';
import { isAuthenticated } from '../lib/authUtils';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'feature', label: 'New feature' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'bug', label: 'Bug report' },
];

/**
 * Floating "Feedback" button + submit form, mounted in the root layout.
 * Submissions go to POST /feedback — anonymous allowed (email required when
 * not signed in). Votes and the public list live on /roadmap.
 */
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('feature');
  const [authorName, setAuthorName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const authed = isAuthenticated();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (title.trim().length < 5) {
      setError('Give your idea a short title (at least 5 characters).');
      return;
    }
    if (!authed && !email.trim()) {
      setError('Please leave an email so we can follow up — or sign in first.');
      return;
    }
    setSubmitting(true);
    try {
      await submitFeatureRequest({
        title: title.trim(),
        body: body.trim() || undefined,
        category,
        authorName: authorName.trim() || undefined,
        email: email.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setTitle('');
    setBody('');
    setCategory('feature');
    setAuthorName('');
    setEmail('');
    setError('');
    setDone(false);
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(o => !o);
          if (!open) setDone(false);
        }}
        className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-lg hover:bg-blue-700 transition-colors"
        aria-expanded={open}
      >
        Feedback
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-80 sm:w-96 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl p-5">
          {done ? (
            <div className="text-center py-4">
              <p className="font-semibold text-black dark:text-white mb-2">Thanks — we got it.</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Your request is on the public roadmap where others can vote for it.
              </p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/roadmap"
                  className="text-sm font-medium text-blue-600 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  View roadmap →
                </Link>
                <button
                  onClick={reset}
                  className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Send another
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-black dark:text-white">Suggest an idea</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close feedback"
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg leading-none"
                >
                  ×
                </button>
              </div>

              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title — what would you like to see?"
                maxLength={160}
                required
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Details (optional)"
                rows={3}
                maxLength={5000}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>

              {!authed && (
                <>
                  <input
                    type="text"
                    value={authorName}
                    onChange={e => setAuthorName(e.target.value)}
                    placeholder="Name (optional)"
                    maxLength={120}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email — so we can follow up"
                    required
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </>
              )}

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 text-white text-sm font-semibold py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
              <p className="text-xs text-zinc-400 text-center">
                Posts publicly on the{' '}
                <Link href="/roadmap" className="underline" onClick={() => setOpen(false)}>
                  roadmap
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      )}
    </>
  );
}
