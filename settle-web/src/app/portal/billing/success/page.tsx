'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken } from '@/lib/authUtils';

import { API_URL } from '@/lib/apiUrl';
function BillingSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    // Refresh stats so the new credit balance shows up
    const token = getStoredToken();
    if (!token) return;
    fetch(`${API_URL}/providers/portal/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => setRefreshed(true))
      .catch(() => setRefreshed(true));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-black dark:text-white mb-2">Payment Successful!</h1>
        <p className="text-zinc-500 mb-1">
          Your credits have been added to your account.
        </p>
        {sessionId && (
          <p className="text-xs text-zinc-400 mb-4">Session: {sessionId}</p>
        )}
        <div className="flex flex-col gap-3 mt-6">
          <Link
            href="/portal/billing"
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
          >
            Back to Billing
          </Link>
          <Link
            href="/portal"
            className="w-full py-3 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Go to Portal
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-zinc-200 border-t-blue-600 rounded-full" /></div>}>
      <BillingSuccessContent />
    </Suspense>
  );
}
