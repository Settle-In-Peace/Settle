import Link from 'next/link';
import ComplianceDisclosure from '../../components/ComplianceDisclosure';

export const metadata = {
  title: 'Disclosures | Settle In Peace',
  description:
    'CFPB and FTC compliance disclosures for Settle In Peace — debt settlement marketing disclosures, fee disclosures, state-specific notices, and complaint information.',
  alternates: { canonical: '/disclosures' },
};

export default function DisclosuresPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
          ← Back to home
        </Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">
          Compliance Disclosures
        </h1>
        <p className="text-zinc-500 mb-12">Last updated: July 7, 2026</p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8">
          {/* ============================================================
              1. NOT A LAW FIRM / NO ATTORNEY-CLIENT RELATIONSHIP
              ============================================================ */}
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              1. Not a Law Firm &amp; No Attorney-Client Relationship
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Settle In Peace, Inc. (&quot;we,&quot; &quot;us,&quot; &quot;our,&quot; or the
              &quot;Service&quot;) is <strong>not a law firm</strong>. We do not provide legal
              advice, legal representation, or legal services of any kind. No attorney-client
              relationship is formed between you and Settle In Peace, its employees, officers, or
              affiliates by your use of this website, our assessment tool, or any other service we
              provide.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              The information provided on this website — including but not limited to debt
              assessment results, provider comparisons, educational articles, and blog posts — is
              for general informational purposes only and is <strong>not legal advice</strong>. You
              should consult a licensed attorney in your jurisdiction for legal guidance specific to
              your situation. If you are facing legal action such as a lawsuit, wage garnishment, or
              judgment, you may need immediate legal representation.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              Additionally, Settle In Peace is <strong>not a credit counseling agency</strong>,{' '}
              <strong>not a debt settlement provider</strong>, and{' '}
              <strong>not a financial advisor</strong>. We do not negotiate debts on your behalf,
              hold consumer funds in trust, or provide personalized financial, tax, or investment
              advice.
            </p>
          </section>

          {/* ============================================================
              2. NATURE OF THE SERVICE
              ============================================================ */}
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              2. Nature of Our Service
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Settle In Peace is a <strong>marketplace and lead-generation platform</strong> that
              connects consumers seeking debt relief with third-party debt relief providers. We are
              a private, for-profit company. We are <strong>not affiliated with, endorsed by, or
              sponsored by</strong> any government agency, including the Consumer Financial
              Protection Bureau (CFPB), the Federal Trade Commission (FTC), or any state or federal
              regulatory body.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              We receive compensation from our partner providers. This compensation may affect which
              providers are featured on our marketplace and the order in which they appear. For more
              information, see our{' '}
              <Link href="#affiliate" className="text-blue-600 hover:underline">
                Affiliate Disclosure
              </Link>{' '}
              below.
            </p>
          </section>

          {/* ============================================================
              3. FEE DISCLOSURE
              ============================================================ */}
          <section id="fee-disclosure">
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              3. Fee Disclosure
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <strong>Settle In Peace does not charge consumers any fees.</strong> Our assessment
              tool is free. There is no cost to create an account, compare providers, or request
              contact with a provider through our platform. We are compensated by our partner
              providers, not by consumers.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Provider fees:</strong> The debt relief providers in our marketplace typically
              charge fees for their services. Under the FTC&apos;s Telemarketing Sales Rule (TSR),
              debt settlement providers may <strong>not</strong> charge or collect any fee until:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400 mt-3">
              <li>
                They have successfully renegotiated, settled, reduced, or otherwise changed the
                terms of at least one of the consumer&apos;s debts;
              </li>
              <li>
                There is a written settlement agreement, debt management plan, or other agreement
                between the consumer and the creditor; and
              </li>
              <li>
                The consumer has made at least one payment to the creditor pursuant to that
                agreement.
              </li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              When fees are charged, they typically range from{' '}
              <strong>15% to 25% of the total enrolled debt</strong>, though the exact fee structure
              varies by provider and state. Some providers may charge fees based on the amount of
              debt saved (i.e., the difference between the original balance and the settled amount)
              rather than the total enrolled debt. You should carefully review any fee agreement
              before enrolling with a provider.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Settle In Peace does not collect, hold, or manage any consumer funds.</strong>{' '}
              All fees are paid directly to the provider you choose. We do not receive any portion
              of the fees you pay to a provider; our compensation is separate and is paid by the
              provider.
            </p>
          </section>

          {/* ============================================================
              4. CREDIT & TAX IMPLICATIONS
              ============================================================ */}
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              4. Credit Score &amp; Tax Implications
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <strong>Credit impact:</strong> Debt settlement services may have a{' '}
              <strong>negative impact on your credit rating</strong>. Enrolling in a debt settlement
              program typically requires you to stop making payments to your creditors, which will
              likely result in late payments, charge-offs, and collections being reported on your
              credit report. These negative marks may remain on your credit report for up to seven
              years and may make it more difficult or expensive to obtain credit in the future.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Tax implications:</strong> Forgiven or cancelled debt exceeding $600 may be
              considered <strong>taxable income</strong> by the Internal Revenue Service (IRS). If a
              creditor forgives $600 or more of your debt, you may receive a{' '}
              <strong>Form 1099-C (Cancellation of Debt)</strong> and may be required to report the
              forgiven amount as income on your federal tax return. This may increase your tax
              liability. You should consult a qualified tax advisor or CPA to understand the tax
              consequences of debt settlement in your specific situation.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Other potential consequences:</strong> Creditors may pursue collection
              activities, including phone calls, letters, and lawsuits, while you are enrolled in a
              debt settlement program. Debt settlement does not guarantee that all creditors will
              agree to negotiate or settle. Not all clients complete their program.
            </p>
          </section>

          {/* ============================================================
              5. NO GUARANTEES
              ============================================================ */}
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              5. No Guarantees of Results
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <strong>Results are not guaranteed</strong> and vary based on individual
              circumstances. Settle In Peace makes no representation or warranty that:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400 mt-3">
              <li>Any provider on our marketplace will be able to settle your debts;</li>
              <li>You will achieve a specific percentage of savings on your enrolled debt;</li>
              <li>Your credit score will improve as a result of using a debt relief program;</li>
              <li>You will be approved for new credit after completing a program;</li>
              <li>
                Any specific provider will accept you as a client or be licensed to operate in your
                state.
              </li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              Statistics displayed on our website — including average savings percentages,
              settlement rates, and program completion rates — are provided by individual providers
              and have not been independently verified by Settle In Peace. Past performance does not
              guarantee future results.
            </p>
          </section>

          {/* ============================================================
              6. STATE-SPECIFIC NOTICES
              ============================================================ */}
          <section id="state-notices">
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              6. State-Specific Notices
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Debt relief services are subject to state-specific licensing and regulatory
              requirements that vary significantly by state. Settle In Peace does not provide debt
              settlement services directly and is therefore not required to hold state debt
              settlement licenses. However, each partner provider on our marketplace is responsible
              for maintaining the licenses, registrations, and surety bonds required in the states
              where they operate.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Availability:</strong> Debt settlement and debt relief services may not be
              available in all states. Certain states impose restrictions on debt settlement
              advertising, fee structures, or the types of debts that may be settled. The
              availability of specific providers and services through our platform depends on your
              state of residence.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Notable state restrictions:</strong>
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400 mt-3">
              <li>
                <strong>California:</strong> Debt relief providers must be registered with the
                California Department of Financial Protection and Innovation (DFPI). Consumers have
                rights under the California Consumer Privacy Act (CCPA) regarding their personal
                information.
              </li>
              <li>
                <strong>New York:</strong> Debt settlement providers must be licensed by the New
                York State Department of Financial Services (DFS). New York imposes caps on fees that
                providers may charge.
              </li>
              <li>
                <strong>Georgia:</strong> Debt adjustment companies are regulated under the Georgia
                Debt Adjustment Act and must comply with specific fee limitations.
              </li>
              <li>
                <strong>Kansas:</strong> Debt management service providers must be licensed by the
                Kansas Office of the State Bank Commissioner.
              </li>
              <li>
                <strong>Connecticut, Oregon, and West Virginia:</strong> These states have
                additional regulatory requirements and restrictions on debt settlement services.
              </li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Consumer action:</strong> Before enrolling with any debt relief provider, you
              should verify the provider&apos;s licensing status with your state&apos;s attorney
              general office or financial regulatory agency. If you believe a provider has violated
              state law, you may file a complaint with your state attorney general.
            </p>
          </section>

          {/* ============================================================
              7. CFPB COMPLAINT INFORMATION
              ============================================================ */}
          <section id="cfpb-complaint">
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              7. Filing a Complaint with the CFPB
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              The Consumer Financial Protection Bureau (CFPB) is a U.S. government agency that
              helps consumers with issues related to financial products and services, including debt
              collection and debt settlement. If you have a complaint about a debt relief provider,
              a debt collector, or any financial product or service, you can submit a complaint to
              the CFPB at no cost.
            </p>
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mt-4">
              <h3 className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-3">
                How to File a CFPB Complaint
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
                <li>
                  <strong>Online:</strong>{' '}
                  <a
                    href="https://www.consumerfinance.gov/complaint/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    consumerfinance.gov/complaint
                  </a>
                </li>
                <li>
                  <strong>Phone:</strong> (855) 411-CFPB (2372) — TTY/TDD: (855) 729-CFPB (2372)
                </li>
                <li>
                  <strong>Mail:</strong> Consumer Financial Protection Bureau, P.O. Box 2900,
                  Clinton, IA 52733-2900
                </li>
                <li>
                  <strong>Email:</strong>{' '}
                  <a
                    href="mailto:info@consumerfinance.gov"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    info@consumerfinance.gov
                  </a>
                </li>
              </ul>
              <p className="text-zinc-600 dark:text-zinc-400 mt-3 text-sm">
                The CFPB will forward your complaint to the company and work to get a response —
                usually within 15 days. You can track the status of your complaint online.
              </p>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-4">
              You may also file a complaint with your{' '}
              <strong>state attorney general&apos;s office</strong> or your state&apos;s financial
              regulatory agency. Many states have their own consumer protection divisions that
              handle complaints about debt relief companies.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              To file a complaint about Settle In Peace specifically, contact us at{' '}
              <a
                href="mailto:help@settleinpeace.com"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                help@settleinpeace.com
              </a>{' '}
              or file a complaint with the CFPB using the information above.
            </p>
          </section>

          {/* ============================================================
              8. AFFILIATE DISCLOSURE
              ============================================================ */}
          <section id="affiliate">
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              8. Affiliate &amp; Compensation Disclosure
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Settle In Peace operates as an affiliate and lead-generation platform. We receive
              compensation from partner debt relief providers when:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400 mt-3">
              <li>A consumer is matched with and contacts a provider through our platform;</li>
              <li>A provider purchases a lead generated through our assessment tool;</li>
              <li>A provider subscribes to our marketplace listing or portal services.</li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              This compensation may affect which providers are featured on our marketplace and the
              order in which they appear. Providers who pay for a &quot;Marketplace Seat&quot; or
              &quot;Enterprise&quot; subscription receive priority placement and enhanced
              visibility. However, all providers in our marketplace must meet our baseline vetting
              criteria, including state licensing verification, BBB rating review, and industry
              memberships (AFCC, IAPDA).
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>We do not receive any compensation from consumers.</strong> Our assessment is
              free, and we do not sell consumer data to data brokers. Consumer contact information
              is shared with partner providers only when the consumer provides explicit consent
              (TCPA opt-in) during the assessment process.
            </p>
          </section>

          {/* ============================================================
              9. FTC TELEMARKETING SALES RULE (TSR) COMPLIANCE
              ============================================================ */}
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              9. FTC Telemarketing Sales Rule (TSR) Compliance
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              The providers in our marketplace are subject to the FTC&apos;s Telemarketing Sales
              Rule (16 CFR Part 310), which regulates debt relief services sold by telemarketing.
              Key consumer protections under the TSR include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400 mt-3">
              <li>
                <strong>No advance fees:</strong> Providers may not charge any fee before
                successfully settling or reducing at least one of the consumer&apos;s debts.
              </li>
              <li>
                <strong>Dedicated account option:</strong> If a provider requires consumers to set
                aside funds for settlement, the consumer must have the option to use a dedicated
                account at an insured financial institution that they own and control.
              </li>
              <li>
                <strong>Truthful disclosures:</strong> Providers must make truthful and
                non-misleading statements about their services, including the likelihood of results,
                the time frame to achieve results, and the impact on credit.
              </li>
              <li>
                <strong>No misrepresentations:</strong> Providers may not falsely claim to be a
                government agency, nonprofit, or legal aid organization.
              </li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              Settle In Peace requires all partner providers to attest to their compliance with the
              TSR and applicable state laws. However, Settle In Peace is not responsible for the
              conduct of individual providers and does not guarantee their compliance.
            </p>
          </section>

          {/* ============================================================
              10. TCPA CONSENT
              ============================================================ */}
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              10. Telephone Consumer Protection Act (TCPA) Consent
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              By completing our assessment and providing your contact information, you expressly
              consent to be contacted by Settle In Peace and its partner debt relief providers via
              phone calls, text messages (SMS), and email regarding your debt relief options. This
              consent constitutes a TCPA-compliant opt-in under the Telephone Consumer Protection
              Act.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              You understand that: (a) standard message and data rates may apply, (b) you may
              receive automated calls or pre-recorded messages, (c) you are not required to provide
              this consent as a condition of purchasing any goods or services, and (d) you may opt
              out at any time by replying &quot;STOP&quot; to text messages, clicking
              &quot;unsubscribe&quot; in emails, or contacting us directly.
            </p>
          </section>

          {/* ============================================================
              11. CONTACT
              ============================================================ */}
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              11. Contact Us
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If you have questions about these disclosures, our services, or your rights as a
              consumer, please contact us:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400 mt-3">
              <li>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:help@settleinpeace.com"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  help@settleinpeace.com
                </a>
              </li>
              <li>
                <strong>Privacy:</strong>{' '}
                <a
                  href="mailto:privacy@settleinpeace.com"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  privacy@settleinpeace.com
                </a>
              </li>
              <li>
                <strong>Legal:</strong> See our{' '}
                <Link href="/terms" className="text-blue-600 hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-blue-600 hover:underline">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </section>
        </div>

        {/* Inline compliance disclosure component */}
        <div className="mt-12">
          <ComplianceDisclosure variant="inline" title="Quick Reference Disclosures" />
        </div>
      </div>
    </div>
  );
}
