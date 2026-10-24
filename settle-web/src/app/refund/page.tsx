import Link from 'next/link';

export const metadata = {
  title: 'Cancellation & Refund Policy | Settle In Peace',
  description:
    'How to cancel a Settle In Peace subscription and how refunds work — separate from any agreement you may have with a third-party debt relief provider.',
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
          ← Back to home
        </Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">
          Cancellation &amp; Refund Policy
        </h1>
        <p className="text-zinc-500 mb-12">Last updated: October 24, 2026</p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              1. What This Policy Covers
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This policy applies only to paid features offered directly by Settle In Peace, Inc.
              (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) — currently our optional coaching
              subscription and any other recurring Settle In Peace plan. It supplements our{' '}
              <Link href="/terms" className="text-blue-600 hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/disclosures" className="text-blue-600 hover:underline">
                Compliance Disclosures
              </Link>
              .
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Our assessment tool, provider comparisons, and marketplace are free for
              consumers.</strong> We are compensated by partner providers — never by charging you
              for access to the marketplace itself.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              2. Important: Provider Agreements Are Separate
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Any debt settlement, debt management, or debt relief agreement you enter into is a
              contract directly between you and that third-party provider —{' '}
              <strong>not</strong> with Settle In Peace. Cancelling a Settle In Peace subscription
              does <strong>not</strong> cancel a provider agreement, and cancelling a provider
              agreement does not cancel a Settle In Peace subscription. For provider-contract
              cancellations and fee disputes, contact the provider directly. Under the FTC&apos;s
              Telemarketing Sales Rule, providers generally may not charge fees before settling at
              least one of your debts — see our{' '}
              <Link href="/disclosures" className="text-blue-600 hover:underline">
                Disclosures
              </Link>{' '}
              for details.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              3. How to Cancel Your Subscription
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <strong>You may cancel at any time</strong> — from your account billing settings, or
              by emailing{' '}
              <a
                href="mailto:help@settleinpeace.com"
                className="text-blue-600 hover:underline"
              >
                help@settleinpeace.com
              </a>{' '}
              from the email address on your account with the subject &quot;Cancel
              subscription.&quot; Cancellation is effective at the end of the billing period you
              have already paid for: your paid features remain active until then, and no further
              renewal is charged.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              4. Refunds
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <strong>Subscription charges are final and non-refundable.</strong> We do not issue
              prorated refunds for unused time, unused features, or partial billing periods,
              except in the following cases:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400 mt-3">
              <li>
                <strong>Billing errors and duplicate charges</strong> — refunded in full;
              </li>
              <li>
                <strong>Unauthorized charges</strong> — refunded once verified;
              </li>
              <li>
                <strong>Where the law requires it</strong> — nothing in this policy limits any
                non-waivable consumer refund right under state or federal law;
              </li>
              <li>
                <strong>Our discretion</strong> — if you were charged in error or believe your
                situation warrants review, contact us; we review good-faith requests individually.
              </li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              Approved refunds are issued to the original payment method through Stripe and
              typically appear within 5–10 business days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              5. Failed Payments &amp; Price Changes
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If a renewal charge fails, we will retry it and notify you to update your payment
              method; paid features may be suspended until the balance is settled. If we change
              subscription pricing, we will notify you at the email on your account before the new
              price applies to your next renewal — cancel before renewal if you do not accept the
              new price.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              6. Your Other Rights
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If you have a complaint about a debt relief provider — including about their fees —
              you may file a complaint with the CFPB at{' '}
              <a
                href="https://www.consumerfinance.gov/complaint/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                consumerfinance.gov/complaint
              </a>{' '}
              or with your state attorney general. For questions about this policy, contact{' '}
              <a
                href="mailto:help@settleinpeace.com"
                className="text-blue-600 hover:underline"
              >
                help@settleinpeace.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
