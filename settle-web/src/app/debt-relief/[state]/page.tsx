import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllStateSlugs, getStateBySlug, STATES } from '../../../content/states';

export function generateStaticParams() {
  return getAllStateSlugs().map((state) => ({ state }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state } = await params;
  const s = getStateBySlug(state);
  if (!s) return { title: 'Not Found | Settle In Peace' };
  const title = `Debt Relief Options in ${s.name} (${s.abbr})`;
  const description = `Compare debt settlement, consolidation, negotiation and nonprofit credit counseling options for ${s.name} residents. Statute of limitations, consumer protections, and a free 2-minute assessment.`;
  return {
    title: `${title} | Settle In Peace`,
    description,
    alternates: { canonical: `/debt-relief/${s.slug}` },
    keywords: [
      `debt relief ${s.name}`,
      `debt settlement ${s.abbr}`,
      `debt consolidation ${s.name}`,
      `statute of limitations debt ${s.name}`,
      `credit counseling ${s.name}`,
    ],
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function StateDebtReliefPage({ params }: Props) {
  const { state } = await params;
  const s = getStateBySlug(state);
  if (!s) notFound();

  const neighbors = STATES.filter((o) => o.slug !== s.slug)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);

  const faq = [
    {
      q: `Is debt settlement legal in ${s.name}?`,
      a: `Yes. Debt settlement is legal in ${s.name} and regulated under federal law — the FTC's Telemarketing Sales Rule prohibits settlement companies from charging upfront fees before a debt is actually settled. Any company demanding payment before results is violating federal law, whatever state they're in.`,
    },
    {
      q: `How long can a creditor sue me for a debt in ${s.name}?`,
      a: `The commonly-cited statute of limitations on written contracts in ${s.name} is about ${s.solYears} years, though the exact number depends on the debt type and how ${s.name} courts classify your account. Once the limitation period expires, collectors can still ask you to pay but generally cannot win a lawsuit if you raise the defense. Verify the current limit with your state attorney general's office or a licensed attorney.`,
    },
    {
      q: `Will debt relief hurt my credit in ${s.name}?`,
      a: `Credit scoring is national — your state doesn't change how a settlement or missed payments affect your score. Settlement typically lowers scores short-term, while nonprofit credit counseling (a Debt Management Plan) generally has a milder impact. Forgiven debt over $600 may be taxable under federal law (1099-C), though the insolvency exclusion can apply.`,
    },
    {
      q: `Are there free debt help resources for ${s.name} residents?`,
      a: `Yes. Nonprofit credit counseling agencies offer free or low-cost consultations nationwide, your state attorney general's consumer protection office handles complaints about collectors, and 211 (dial 2-1-1) connects ${s.name} residents with local financial assistance programs.`,
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const options = [
    {
      name: 'Debt settlement',
      desc: 'Negotiating with creditors to accept less than the full balance. Can cut principal significantly but typically costs credit points short-term and forgiven amounts may be taxable.',
      href: '/learn/what-is-debt-settlement',
    },
    {
      name: 'Debt consolidation',
      desc: 'Combining multiple debts into one loan or payment, ideally at a lower rate. Best for people whose credit still qualifies — it simplifies payments rather than reducing the balance.',
      href: '/learn/debt-settlement-vs-consolidation',
    },
    {
      name: 'DIY creditor negotiation',
      desc: 'Calling creditors yourself to request hardship programs, lower rates, or settlements. Free to try and many people succeed — our script walks through exactly what to say.',
      href: '/learn/how-to-negotiate-with-creditors',
    },
    {
      name: 'Nonprofit credit counseling (DMP)',
      desc: 'A Debt Management Plan through a nonprofit agency consolidates payments and often reduces interest rates without settling. Milder credit impact, but requires steady income.',
      href: '/compare',
    },
    {
      name: 'Bankruptcy (Chapter 7 or 13)',
      desc: 'The legal reset button — can discharge qualifying debts entirely but carries the most serious credit consequences. Always consult a licensed attorney in your state first.',
      href: '/learn/bankruptcy-vs-debt-settlement',
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="max-w-3xl mx-auto px-4 pt-8">
        <nav className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/debt-relief" className="hover:text-blue-600 dark:hover:text-blue-400">Debt Relief</Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">{s.name}</span>
        </nav>
      </div>

      <header className="max-w-3xl mx-auto px-4 pt-8 pb-10">
        <span className="inline-block text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-full px-3 py-1 mb-4">
          State Guide · {s.abbr}
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-black dark:text-white mb-5">
          Debt Relief Options in {s.name}
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
          If you&apos;re carrying $10,000 or more in credit card or other unsecured debt in {s.name},
          you have more options than minimum payments. Here&apos;s how each path works, what {s.name} law
          says about collection time limits, and where to get free help.
        </p>
      </header>

      <article className="max-w-3xl mx-auto px-4 pb-16">
        {/* Assessment CTA */}
        <div className="my-8 rounded-2xl bg-blue-600 p-6 sm:p-8 text-white">
          <h2 className="text-xl font-bold mb-2">See your options in 2 minutes</h2>
          <p className="text-blue-100 mb-5">
            Answer a few questions about your debt and get a personalized comparison of the
            relief paths available to {s.name} residents. Free, no phone call required.
          </p>
          <Link
            href="/assessment"
            className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Start the free assessment
          </Link>
        </div>

        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          {s.name} statute of limitations on debt
        </h2>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          The commonly-cited statute of limitations on written contracts in {s.name} is about{' '}
          <strong>{s.solYears} years</strong> — that&apos;s the window a creditor generally has to win a
          lawsuit over an unpaid written debt. The clock usually starts at the last payment or account
          activity, and in some states making a partial payment or acknowledging the debt in writing
          can restart it.
        </p>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          Time-barred debt doesn&apos;t disappear — collectors can still contact you — but they
          generally can&apos;t win a judgment if you show up and raise the defense. Always verify the
          current limit for your specific debt type with your{' '}
          <a href="https://www.naag.org/find-my-ag/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
            state attorney general
          </a>{' '}
          or a licensed attorney.
        </p>

        {s.communityProperty && (
          <div className="my-6 bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 rounded-r-xl p-5">
            <p className="text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
              {s.name} is a community property state. Most debts one spouse takes on during a marriage
              can be treated as joint obligations — including debts you didn&apos;t sign for. That makes
              strategy decisions (which debts to settle first, whether to file anything jointly)
              different here than in common-law states. Worth a conversation with a licensed
              professional before you commit to a plan.
            </p>
          </div>
        )}

        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          Your debt relief options in {s.name}
        </h2>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          Federal law governs most of the process, so the core options are the same nationwide — what
          changes state to state is the collection timeline, exemption rules, and which local
          resources exist. Here&apos;s how the five main paths compare:
        </p>
        <div className="space-y-4 mb-8">
          {options.map((o) => (
            <div key={o.name} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
              <h3 className="font-bold text-black dark:text-white mb-1">
                <Link href={o.href} className="hover:text-blue-600 dark:hover:text-blue-400">
                  {o.name}
                </Link>
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{o.desc}</p>
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          Free resources for {s.name} residents
        </h2>
        <ul className="list-disc pl-6 space-y-2 text-zinc-700 dark:text-zinc-300 mb-8 leading-relaxed">
          <li>
            <a href="https://www.naag.org/find-my-ag/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              {s.name} Attorney General — consumer protection
            </a>{' '}
            — file complaints about collector harassment or unfair practices.
          </li>
          <li>
            <a href="https://www.consumerfinance.gov/complaint/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              CFPB complaint portal
            </a>{' '}
            — federal complaints against collectors, credit bureaus, and lenders.
          </li>
          <li>
            <a href="https://www.211.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              211 — {s.name} community assistance
            </a>{' '}
            — local help with rent, utilities, food, and financial counseling.
          </li>
          <li>
            <a href="https://www.nfcc.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              National Foundation for Credit Counseling
            </a>{' '}
            — nonprofit counseling agencies serving {s.name}.
          </li>
        </ul>

        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          Frequently asked questions
        </h2>
        <div className="space-y-6 mb-10">
          {faq.map((f) => (
            <div key={f.q}>
              <h3 className="font-bold text-black dark:text-white mb-2">{f.q}</h3>
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 p-5 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <strong className="text-zinc-600 dark:text-zinc-300">Disclaimer:</strong> This page is for
            educational purposes only and is not legal, tax, or financial advice. Statutes of
            limitations and state consumer protections change and vary by debt type — verify current
            law with the {s.name} attorney general&apos;s office or a licensed attorney. Debt settlement
            may negatively impact your credit score, and forgiven debt over $600 may be taxable.
          </p>
        </div>

        {/* Nearby states */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-black dark:text-white mb-4">
            Debt relief guides for other states
          </h2>
          <div className="flex flex-wrap gap-2">
            {neighbors.map((n) => (
              <Link
                key={n.slug}
                href={`/debt-relief/${n.slug}`}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {n.name}
              </Link>
            ))}
            <Link
              href="/debt-relief"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              All states →
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
