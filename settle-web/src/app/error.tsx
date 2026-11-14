'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Logo from '../components/Logo';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability without exposing details to visitors.
    console.error('Unhandled route error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Logo markClassName="h-8 w-auto" />
        </div>
        <h1 className="text-3xl font-bold text-black dark:text-white mb-3">
          Something went wrong
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          An unexpected error occurred while loading this page. You can try
          again or head back to the homepage.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
