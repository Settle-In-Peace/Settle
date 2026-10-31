'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { setProviderPassword } from '@/lib/api';
import PasswordInput from '../../../components/PasswordInput';
import Logo from '../../../components/Logo';

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const valid = password.length >= 8 && password === confirm && token.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError('');
    try {
      await setProviderPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'This setup link is invalid or has expired. Please contact partners@settleinpeace.com.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-black dark:text-white mb-3">Missing setup link</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6">
          This page needs the secure link from your approval email. Check your inbox for a message from Settle In Peace.
        </p>
        <Link href="/providers" className="text-blue-600 dark:text-blue-400 hover:underline">
          Back to provider enrollment
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-black dark:text-white mb-3">You're all set</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6">
          Your portal password is saved. Log in to see your matched leads and manage your marketplace profile.
        </p>
        <Link
          href="/login"
          className="inline-block px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
        >
          Log In to Your Portal
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-black dark:text-white mb-2">Set your portal password</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
        Your provider account is approved — choose a password to activate access.
      </p>

      {error && (
        <div className="mb-5 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            New password *
          </label>
          <PasswordInput
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Confirm password *
          </label>
          <PasswordInput
            required
            minLength={8}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
          {confirm.length > 0 && confirm !== password && (
            <p className="mt-1 text-sm text-red-600">Passwords don't match.</p>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting || !valid}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Set Password & Activate'}
        </button>
      </form>
    </div>
  );
}

export default function ProviderSetPasswordPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-8">
          <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
            <SetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
