'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_URL } from '../../../lib/apiUrl';

export default function ClaimListingPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@') || state === 'busy') return;
    setState('busy');
    try {
      const res = await fetch(`${API_URL}/providers/directory/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setState(res.ok ? 'done' : 'err');
    } catch {
      setState('err');
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <Link href="/attorneys" className="text-sm text-emerald-700 hover:underline">← Directory</Link>
      <h1 className="mt-6 text-3xl font-bold text-slate-900">Claim your listing</h1>
      <p className="mt-3 text-slate-600">
        Enter the email associated with your practice. We&apos;ll send a secure link to
        manage your public profile and upgrade to Featured placement if you choose.
      </p>
      {state === 'done' ? (
        <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
          Check your inbox — the claim link expires in 72 hours.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourfirm.com"
            className="w-full rounded-lg border border-slate-300 px-4 py-3"
          />
          {state === 'err' && (
            <p className="text-sm text-red-600">Something went wrong — try again.</p>
          )}
          <button
            disabled={state === 'busy'}
            className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {state === 'busy' ? 'Sending…' : 'Email me a claim link'}
          </button>
        </form>
      )}
      <p className="mt-6 text-xs text-slate-500">
        Free listings include name, firm, city, and contact form. Featured placement is
        flat-rate monthly advertising — no per-lead or per-client fees, ever.
      </p>
    </main>
  );
}
