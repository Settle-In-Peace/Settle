import Link from 'next/link';
import type { Metadata } from 'next';
import CalculatorsClient from './CalculatorsClient';

export const metadata: Metadata = {
  title: 'Free Debt Calculators — DTI & Payoff | Settle In Peace',
  description:
    'Use our free debt-to-income (DTI) and debt payoff calculators to understand your debt and explore payoff timelines. No signup required.',
  alternates: { canonical: '/calculators' },
  openGraph: {
    title: 'Free Debt Calculators — DTI & Payoff | Settle In Peace',
    description:
      'Estimate your debt-to-income ratio and see how long it will take to pay off your debt. Free, fast, and private.',
    type: 'website',
  },
};

export default function CalculatorsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <p className="text-sm text-blue-200 font-semibold uppercase tracking-wide mb-3">
            Free Tools
          </p>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
            Free Debt Calculators
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl leading-relaxed">
            Quickly estimate your debt-to-income ratio and see how long it will take to pay off
            your debt. No signup, no spam — just honest numbers.
          </p>
        </div>
      </section>

      <CalculatorsClient />

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-to-br from-green-50 to-blue-50 dark:from-zinc-950 dark:to-zinc-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-black text-black dark:text-white mb-4">
            Want a personalized plan?
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
            Take the free 2-minute assessment and get matched with debt relief providers.
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
