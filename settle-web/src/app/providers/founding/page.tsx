import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Founding Provider Program — Settle In Peace',
  description:
    'Founding-cohort terms for debt-relief providers joining the Settle In Peace marketplace: flat-rate directory placement and exclusive lead access.',
};

/**
 * Static founding-provider program stub.
 *
 * Flat-rate founding terms only — no per-lead pricing is quoted on
 * regulated services (FTC TSR; flagged for counsel). Formal program terms
 * are a draft pending counsel review (docs/provider-founding-terms.md);
 * enrollment remains subject to the provider agreement presented at
 * onboarding.
 */
export default function FoundingProvidersPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide mb-3">
          For Debt Relief Companies
        </p>
        <h1 className="text-4xl font-black text-black dark:text-white mb-4">
          Founding provider program
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-10">
          We&apos;re onboarding a small founding cohort of partner providers.
          Founding members get early access to the lead marketplace and
          locked introductory rates on directory placement.
        </p>

        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-bold text-black dark:text-white mb-2">
              Founding Featured placement — $75/month
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A flat-rate featured position in our public directory — labeled
              as a paid placement, limited to the first five providers per
              state, with the introductory rate locked for 12 months.
              Placement is advertising only; we never charge per lead or per
              client for it.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-bold text-black dark:text-white mb-2">
              Marketplace Seat — founding rate $99/month
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              One marketplace seat with a 30-day free trial: company profile
              on the comparison page, priority placement in consumer results,
              and access to the exclusive-lead inbox. Founding rate locked
              for 12 months (standard $199/month).
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-bold text-black dark:text-white mb-2">
              Exclusive lead access
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Matched consumer leads delivered to your portal — each lead is
              matched to one provider only, no shared leads. Lead flow
              details are shared during onboarding.
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 p-5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Providers on Settle In Peace are independent companies — listing
            does not mean we endorse, certify, or employ them. Formal founding
            terms are being finalized; enrollment is subject to the provider
            agreement presented at onboarding. Questions:{' '}
            <a
              href="mailto:partners@settleinpeace.com"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              partners@settleinpeace.com
            </a>
            .
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/providers"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
          >
            Apply to join
          </Link>
        </div>
      </div>
    </div>
  );
}
