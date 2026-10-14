import Link from 'next/link';
import type { Metadata } from 'next';
import { STATES } from '../../content/states';

export const metadata: Metadata = {
  title: 'Debt Relief by State — Guides for All 50 States | Settle In Peace',
  description:
    'State-by-state debt relief guides: statutes of limitations, consumer protections, and your real options for credit card debt in every US state.',
  alternates: { canonical: '/debt-relief' },
};

export default function DebtReliefHub() {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Debt relief guides by state',
    itemListElement: STATES.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `Debt relief options in ${s.name}`,
      url: `https://settleinpeace.com/debt-relief/${s.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />

      <div className="max-w-4xl mx-auto px-4 pt-8 pb-16">
        <nav className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
          <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Debt Relief by State</span>
        </nav>

        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-black dark:text-white mb-5">
            Debt Relief Options, State by State
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
            Collection time limits, consumer protections, and available help vary by state. Pick
            yours for a guide to your real options — then compare them side-by-side with our free
            2-minute assessment.
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-12">
          {STATES.map((s) => (
            <Link
              key={s.slug}
              href={`/debt-relief/${s.slug}`}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <div className="font-semibold text-black dark:text-white text-sm">{s.name}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                SOL ~{s.solYears} yrs · {s.abbr}
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl bg-blue-600 p-6 sm:p-8 text-white">
          <h2 className="text-xl font-bold mb-2">Not sure which path fits?</h2>
          <p className="text-blue-100 mb-5">
            The free assessment compares settlement, consolidation, negotiation and counseling
            against your actual numbers.
          </p>
          <Link
            href="/assessment"
            className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Start the free assessment
          </Link>
        </div>
      </div>
    </div>
  );
}
