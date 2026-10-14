import Link from 'next/link';
import type { Metadata } from 'next';
import EligibilityChecker from './EligibilityChecker';

export const metadata: Metadata = {
  title: 'Free Debt Relief Eligibility Checker — See Your Options | Settle In Peace',
  description:
    'Answer 6 quick questions and see which debt relief options may fit your situation — settlement, nonprofit credit counseling, bankruptcy consult, or DIY payoff. State-aware, free, no credit check.',
  alternates: { canonical: '/tools/eligibility-checker' },
  keywords: [
    'debt relief eligibility checker',
    'do I qualify for debt settlement',
    'debt relief options quiz',
    'debt management plan eligibility',
    'debt help tool',
  ],
  openGraph: {
    title: 'Free Debt Relief Eligibility Checker',
    description:
      'Six questions, honest results: which debt relief paths may fit your situation — ranked, with state-specific notes.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

const faq = [
  {
    q: 'Does this checker affect my credit score?',
    a: 'No. The eligibility checker runs entirely in your browser — it never pulls your credit, and your answers are not sent anywhere unless you choose to continue to the full assessment.',
  },
  {
    q: 'Is this a guarantee that I qualify for debt relief?',
    a: 'No. The results are an educational estimate based on typical program criteria — for example, most settlement companies require roughly $7,500–$10,000 in unsecured debt, and nonprofit Debt Management Plans require steady income. Final eligibility is always determined by the provider or professional you work with.',
  },
  {
    q: 'What are the main debt relief options?',
    a: 'The four paths this tool compares are: debt settlement (negotiating balances down, credit impact applies), nonprofit credit counseling / a Debt Management Plan (one payment, reduced interest), a bankruptcy attorney consultation (the legal reset — a consult is not a commitment to file), and DIY payoff or self-negotiation (free to try first).',
  },
  {
    q: 'Why does my state matter for debt relief?',
    a: 'Federal law governs most of the process, but each state sets its own statute of limitations on how long a creditor can sue over a debt, plus homestead exemptions, wage-garnishment limits, and local resources. That is why the checker asks for your state first.',
  },
  {
    q: 'Is debt settlement safe?',
    a: 'It is legal and regulated — the FTC\u2019s Telemarketing Sales Rule bans settlement companies from charging fees before a debt is actually settled. But it typically lowers your credit score short-term, forgiven amounts over $600 may be taxable, and no creditor is required to negotiate. Anyone who guarantees a specific outcome is a red flag.',
  },
];

export default function EligibilityCheckerPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const appJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Debt Relief Eligibility Checker',
    url: 'https://settleinpeace.com/tools/eligibility-checker',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description:
      'Free interactive tool that ranks which debt relief options may fit your situation based on state, debt amount, payment status, and hardship.',
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }} />

      <div className="max-w-3xl mx-auto px-4 pt-8">
        <nav className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/debt-relief" className="hover:text-blue-600 dark:hover:text-blue-400">Debt Relief</Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Eligibility Checker</span>
        </nav>
      </div>

      <header className="max-w-3xl mx-auto px-4 pt-8 pb-8">
        <span className="inline-block text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-full px-3 py-1 mb-4">
          Free Tool · 6 questions · No credit check
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-black dark:text-white mb-5">
          Debt Relief Eligibility Checker
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Answer six quick questions and see which debt relief paths are worth exploring for your
          situation — settlement, nonprofit credit counseling, a bankruptcy consult, or doing it
          yourself — ranked with honest tradeoffs and notes for your state.
        </p>
      </header>

      <section className="max-w-3xl mx-auto px-4 pb-12">
        <EligibilityChecker />
      </section>

      {/* Static SEO / education content below the tool */}
      <article className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          How this checker works
        </h2>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          Each relief path has typical eligibility patterns. Settlement companies generally require
          $7,500–$10,000+ in unsecured debt and are built for people already behind on payments.
          Nonprofit Debt Management Plans need steady income but accept people who are still current.
          Bankruptcy is the legal option with the strongest protections — and the strongest
          consequences — so the honest recommendation is always a consultation, not a conclusion.
          And for smaller balances, negotiating directly with creditors is free and often effective.
        </p>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          The checker weighs your answers against those patterns and ranks the options — but it
          cannot tell you what will happen, and neither can anyone else before a real review of your
          debts. Be skeptical of any company that promises specific savings or outcomes.
        </p>

        <h2 className="text-2xl font-black text-black dark:text-white mt-10 mb-4">
          Know the rules that protect you
        </h2>
        <ul className="list-disc pl-6 space-y-2 text-zinc-700 dark:text-zinc-300 mb-8 leading-relaxed">
          <li>
            <strong>No upfront settlement fees.</strong> Federal law (the FTC&apos;s Telemarketing
            Sales Rule) prohibits debt settlement companies from charging you before they settle a
            debt.
          </li>
          <li>
            <strong>Collectors have a time limit.</strong> Every state sets a statute of limitations
            on debt lawsuits — commonly 3–10 years. Once expired, you have a legal defense. Your
            state guide has the details.
          </li>
          <li>
            <strong>You can report bad actors.</strong> The{' '}
            <a href="https://www.consumerfinance.gov/complaint/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              CFPB
            </a>{' '}
            and your{' '}
            <a href="https://www.naag.org/find-my-ag/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              state attorney general
            </a>{' '}
            both take complaints about collector harassment and deceptive relief companies.
          </li>
          <li>
            <strong>Free help exists.</strong>{' '}
            <a href="https://www.nfcc.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
              NFCC-member
            </a>{' '}
            nonprofit agencies offer free or low-cost counseling sessions nationwide.
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
            <strong className="text-zinc-600 dark:text-zinc-300">Disclaimer:</strong> This tool is
            for educational purposes only and is not legal, tax, or financial advice. Results are
            estimates based on typical program criteria — they are not a guarantee of eligibility,
            acceptance, savings, or outcome. Statutes of limitations and consumer protections vary
            by state and debt type; verify current law with your state attorney general or a
            licensed attorney. Debt settlement may negatively impact your credit score, and forgiven
            debt over $600 may be taxable. Settle In Peace is a marketplace, not a debt settlement
            provider.
          </p>
        </div>
      </article>
    </div>
  );
}
