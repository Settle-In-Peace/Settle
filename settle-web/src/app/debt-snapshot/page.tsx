import Link from 'next/link';
import type { Metadata } from 'next';
import DebtSnapshotClient from './DebtSnapshotClient';

export const metadata: Metadata = {
  title: 'Free Debt Snapshot — See Your Payoff vs Settlement Numbers | Settle In Peace',
  description:
    'Enter your debts and instantly see your payoff timeline, total interest, and an estimated debt-settlement comparison. Get your snapshot + free 7-day debt course by email.',
  alternates: { canonical: '/debt-snapshot' },
  openGraph: {
    title: 'Free Debt Snapshot — Payoff vs Settlement | Settle In Peace',
    description:
      'Instant debt snapshot: payoff timeline, interest cost, and estimated settlement savings. Free, private, no credit check.',
    type: 'website',
  },
};

export default function DebtSnapshotPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <p className="text-sm text-blue-200 font-semibold uppercase tracking-wide mb-3">
            Free Tool — 60 seconds
          </p>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
            Your Debt Snapshot
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl leading-relaxed">
            Add your debts and see two futures side by side: grinding out minimum
            payments vs. an estimated settlement program. Then get the snapshot —
            plus a free 7-day debt course — in your inbox.
          </p>
        </div>
      </section>

      <DebtSnapshotClient />

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-to-br from-green-50 to-blue-50 dark:from-zinc-950 dark:to-zinc-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-black text-black dark:text-white mb-4">
            Ready to talk through your options?
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
            The free assessment matches you with debt relief providers.
            No credit check, no obligation.
          </p>
          <Link
            href="/assessment"
            className="inline-block px-10 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg"
          >
            Take the Free Assessment →
          </Link>
        </div>
      </section>
    </div>
  );
}
