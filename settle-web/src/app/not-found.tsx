import Link from 'next/link';
import Logo from '../components/Logo';

export const metadata = {
  title: 'Page not found | Settle In Peace',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Logo markClassName="h-8 w-auto" />
        </div>
        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">
          404
        </p>
        <h1 className="text-3xl font-bold text-black dark:text-white mb-3">
          Page not found
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to home
          </Link>
          <Link
            href="/assessment"
            className="px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Take the free assessment
          </Link>
        </div>
      </div>
    </div>
  );
}
