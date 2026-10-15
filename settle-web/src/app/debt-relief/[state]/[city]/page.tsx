import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStateBySlug } from '../../../../content/states';
import { getAllCitySlugs, getCity, getCitiesByState } from '../../../../content/cities';

export function generateStaticParams() {
  return getAllCitySlugs();
}

type Props = { params: Promise<{ state: string; city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state, city } = await params;
  const s = getStateBySlug(state);
  const c = getCity(state, city);
  if (!s || !c) return { title: 'Not Found | Settle In Peace' };
  const title = `Debt Relief Options in ${c.name}, ${s.abbr}`;
  const description = `Compare debt settlement, consolidation, negotiation and nonprofit credit counseling for ${c.name} residents. ${s.name} collection time limits, free local resources, and a free 2-minute assessment.`;
  return {
    title: `${title} | Settle In Peace`,
    description,
    alternates: { canonical: `/debt-relief/${s.slug}/${c.slug}` },
    keywords: [
      `debt relief ${c.name}`,
      `debt settlement ${c.name} ${s.abbr}`,
      `debt consolidation ${c.name}`,
      `credit counseling ${c.name} ${s.name}`,
      `debt help ${c.name}`,
    ],
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CityDebtReliefPage({ params }: Props) {
  const { state, city } = await params;
  const s = getStateBySlug(state);
  const c = getCity(state, city);
  if (!s || !c) notFound();

  const siblings = getCitiesByState(state).filter((o) => o.slug !== c.slug).slice(0, 10);

  const faq = [
    {
      q: `Is debt settlement legal in ${c.name}?`,
      a: `Yes. Debt settlement is legal in ${c.name} and across ${s.name} — it's regulated primarily by federal law. The FTC's Telemarketing Sales Rule prohibits settlement companies from charging upfront fees before a debt is actually settled, and the rule applies in every city. Any company demanding payment before delivering results is violating federal law.`,
    },
    {
      q: `How long can a creditor sue me for a debt in ${c.name}?`,
      a: `Collection time limits are set by ${s.name} state law, not by city — the commonly-cited statute of limitations on written contracts in ${s.name} is about ${s.solYears} years. The clock usually starts at your last payment or account activity. Once expired, collectors can still ask you to pay but generally cannot win a lawsuit if you raise the defense. Verify the current limit with the ${s.name} attorney general's office or a licensed attorney.`,
    },
    {
      q: `Are there free debt help resources in ${c.name}?`,
      a: `Yes. Nonprofit credit counseling agencies offer free or low-cost consultations and serve ${c.name} residents by phone and online, the ${s.name} attorney general's consumer protection office handles complaints about collectors, and dialing 2-1-1 connects ${c.name} residents with local financial assistance programs.`,
    },
    {
      q: `Will settling debt hurt my credit in ${c.name}?`,
      a: `Credit scoring is national — living in ${c.name} doesn't change how settlement or missed payments affect your score. Settlement typically lowers scores short-term while nonprofit Debt Management Plans generally have a milder impact. Forgiven debt over $600 may be taxable under federal law (1099-C), though the insolvency exclusion can apply.`,
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
      desc: 'The legal reset button — can discharge qualifying debts entirely but carries the most serious credit consequences. Consult a licensed attorney admitted in your state before filing.',
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
          <Link href={`/debt-relief/${s.slug}`} className="hover:text-blue-600 dark:hover:text-blue-400">{s.name}</Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">{c.name}</span>
        </nav>
      </div>

      <header className="max-w-3xl mx-auto px-4 pt-8 pb-10">
        <span className="inline-block text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-full px-3 py-1 mb-4">
          City Guide · {c.name}, {s.abbr}
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-black dark:text-white mb-5">
          Debt Relief Options in {c.name}
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
          If you&apos;re carrying $10,000 or more in credit card or other unsecured debt in {c.name},
          you have more options than minimum payments. Here&apos;s how each path works, what {s.name}
          law says about collection time limits, and where {c.name} residents can get free help.
        </p>
      </header>

      <article className="max-w-3xl mx-auto px-4 pb-16">
        {/* Assessment CTA */}
        <div className="my-8 rounded-2xl bg-blue-600 p-6 sm:p-8 text-white">
          <h2 className="text-xl font-bold mb-2">See your options in 2 minutes</h2>
          <p className="text-blue-100 mb-5">
            Answer a few questions about your debt and get a personalized comparison of the
            relief paths available to {c.name} residents. Free, no phone call required.
          </p>
          <Link
            href="/assessment"
            className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Start the free assessment
          </Link>
        </div>

        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          What {s.name} law means for {c.name} residents
        </h2>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          Debt collection rules in {c.name} follow {s.name} state law — cities don&apos;t set their own
          statutes of limitations or exemption rules. The commonly-cited limit on written contracts in{' '}
          {s.name} is about <strong>{s.solYears} years</strong>: that&apos;s the window a creditor
          generally has to win a lawsuit over an unpaid written debt.
        </p>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          If a collector sues you in {c.name}, the case is typically filed in the county or municipal
          court covering your address — and ignoring a summons is how default judgments happen. If
          you&apos;re served, respond by the deadline on the papers even if you plan to settle; courts
          in {s.name} routinely enter judgments against people who simply don&apos;t show up.
        </p>

        {s.communityProperty && (
          <div className="my-6 bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 rounded-r-xl p-5">
            <p className="text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
              {s.name} is a community property state — which matters in {c.name} too. Most debts one
              spouse takes on during a marriage can be treated as joint obligations, including debts
              you didn&apos;t sign for. Worth a conversation with a licensed professional before you
              commit to a plan.
            </p>
          </div>
        )}

        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          Your debt relief options in {c.name}
        </h2>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          Every option below is available to {c.name} residents — settlement and counseling work by
          phone and online, so local availability is rarely the constraint. The real question is which
          path fits your balance, income, and timeline:
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
          Free resources for {c.name} residents
        </h2>
        <ul className="list-disc pl-6 space-y-2 text-zinc-700 dark:text-zinc-300 mb-8 leading-relaxed">
          <li>
            <a href="https://www.naag.org/find-my-ag/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              {s.name} Attorney General — consumer protection
            </a>{' '}
            — file complaints about collector harassment in {c.name} or anywhere in {s.name}.
          </li>
          <li>
            <a href="https://www.consumerfinance.gov/complaint/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              CFPB complaint portal
            </a>{' '}
            — federal complaints against collectors, credit bureaus, and lenders.
          </li>
          <li>
            <a href="https://www.211.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              211 — community assistance
            </a>{' '}
            — local help with rent, utilities, food, and financial counseling in the {c.name} area.
          </li>
          <li>
            <a href="https://www.nfcc.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              National Foundation for Credit Counseling
            </a>{' '}
            — nonprofit counseling agencies serving {c.name} residents.
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
            limitations and consumer protections change and vary by debt type — verify current law
            with the {s.name} attorney general&apos;s office or a licensed attorney. Debt settlement
            may negatively impact your credit score, and forgiven debt over $600 may be taxable.
          </p>
        </div>

        {/* Sibling cities + state link */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-black dark:text-white mb-4">
            More {s.name} city guides
          </h2>
          <div className="flex flex-wrap gap-2">
            {siblings.map((n) => (
              <Link
                key={n.slug}
                href={`/debt-relief/${s.slug}/${n.slug}`}
                className="rounded-full border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {n.name}
              </Link>
            ))}
            <Link
              href={`/debt-relief/${s.slug}`}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {s.name} guide →
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
