import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Settle In Peace',
  description: 'Terms of Service for Settle In Peace — the debt relief marketplace.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">← Back to home</Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">Terms of Service</h1>
        <p className="text-zinc-500 mb-12">Last updated: July 7, 2026</p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">1. Acceptance of Terms</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              By accessing or using Settle In Peace (&quot;we,&quot; &quot;us,&quot; &quot;our,&quot; or the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service. Settle In Peace is operated by Settle In Peace, Inc.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">2. Description of Service</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Settle In Peace is a marketplace platform that connects consumers seeking debt relief solutions with third-party debt relief providers. We are <strong>not</strong> a debt settlement company, debt consolidator, credit counseling agency, or law firm. We do not negotiate debts on your behalf, hold consumer funds, or provide legal, tax, or financial advice.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              Our Service includes: (a) a free online assessment tool that evaluates your debt situation, (b) a marketplace where you can compare debt relief providers, and (c) lead generation services for our partner providers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">3. Eligibility</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              You must be at least 18 years of age and a resident of the United States to use the Service. By using the Service, you represent and warrant that you meet these eligibility requirements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">4. Consumer Responsibilities</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">As a consumer using our Service, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li>Provide accurate, complete, and current information when completing the assessment</li>
              <li>Not impersonate any other person or entity</li>
              <li>Not use the Service for any illegal or unauthorized purpose</li>
              <li>Not attempt to manipulate the assessment or marketplace system</li>
              <li>Understand that we do not guarantee any specific outcome from using the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">5. TCPA Consent & Communications</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              By completing the assessment and providing your contact information, you expressly consent to be contacted by Settle In Peace and its partner debt relief providers via phone calls, text messages (SMS), and email regarding your debt relief options. This consent constitutes a TCPA-compliant opt-in under the Telephone Consumer Protection Act.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              You understand that: (a) standard message and data rates may apply, (b) you may receive automated calls or pre-recorded messages, (c) you are not required to provide this consent as a condition of purchasing any goods or services, and (d) you may opt out at any time by replying &quot;STOP&quot; to text messages, clicking &quot;unsubscribe&quot; in emails, or contacting us directly.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">6. Third-Party Providers</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              The debt relief providers in our marketplace are independent third parties. We do not control their services, fees, or practices. Any engagement with a provider is solely between you and that provider. We are not a party to any agreement between you and a provider.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              We screen providers based on state licensing, BBB ratings, and industry memberships (AFCC, IAPDA). However, we do not guarantee the performance, results, or conduct of any provider. You should independently evaluate any provider before engaging their services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">6A. Dialer-as-a-Software (DaaS) for Collection Agencies</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Settle In Peace also licenses a per-seat software platform (&quot;DaaS&quot;) to collection agencies, law firms, and similar organizations (&quot;Customers&quot;). DaaS subscriptions are billed monthly per seat, and outbound calling may incur usage-based charges (per-minute overage) at the rates published in the Customer&apos;s plan. Seat licenses are assigned to individual agents within the Customer&apos;s organization and may be reassigned or suspended by the Customer&apos;s administrators.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Settle In Peace is a software vendor only.</strong> We are not a debt collector, collection agency, debt buyer, or law firm, and we do not engage in debt collection on behalf of any party. The Customer is solely the FDCPA-licensed collector of record and is solely responsible for: (a) its own compliance with the Fair Debt Collection Practices Act, the Telephone Consumer Protection Act, the Fair Credit Reporting Act, Regulation F, state collection/licensing laws, and all other applicable law; (b) obtaining and documenting any consumer consent required before placing calls or texts through the platform, and honoring do-not-call requests; (c) the conduct of its agents and the content of its communications. Compliance features in the platform (DNC screening, consent checks, calling-window indicators, AI-drafted scripts) are assistive tools only — they do not guarantee compliance and do not constitute legal advice.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              AI-generated outputs (suggested actions, scripts, offer letters, compliance flags) are advisory drafts that require review and approval by a qualified human before any consumer-facing use. Nothing on the platform is legal advice; Customers should consult their own counsel.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Dispute resolution for DaaS Customers.</strong> Any dispute between Settle In Peace, Inc. and a DaaS Customer arising out of or relating to the DaaS subscription shall be resolved by binding individual arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, seated in Delaware. The parties waive any right to participate in a class action, class arbitration, or other representative proceeding, and waive trial by jury, to the fullest extent permitted by law. This clause applies to business Customers only and does not affect consumers&apos; rights under the remainder of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">7. No Guarantees</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Debt settlement and debt consolidation programs may negatively impact your credit score. Forgiven debt exceeding $600 may be considered taxable income by the IRS. Results vary based on individual circumstances. Not all clients complete their programs. Not all services are available in all states. We make no guarantees regarding the outcome of any debt relief program.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">8. Intellectual Property</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              All content on the Service, including text, graphics, logos, and software, is the property of Settle In Peace, Inc. or its licensors and is protected by U.S. and international copyright and trademark laws. You may not reproduce, distribute, or create derivative works from our content without prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">9. Limitation of Liability</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              To the maximum extent permitted by law, Settle In Peace, Inc. shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or goodwill, arising from your use of the Service or any interaction with a third-party provider.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">10. Indemnification</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              You agree to indemnify and hold harmless Settle In Peace, Inc., its officers, directors, employees, and partners from any claims, damages, or expenses arising from your use of the Service or your violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">11. Privacy</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Your use of the Service is also governed by our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>, which describes how we collect, use, and protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">12. Modifications to Terms</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of material changes by posting the updated Terms on this page with a new &quot;Last updated&quot; date. Your continued use of the Service after any changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">13. Governing Law</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions. Any disputes arising from these Terms shall be resolved in the state or federal courts located in Delaware.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">14. Contact</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If you have questions about these Terms, please contact us at:<br />
              Email: <a href="mailto:legal@settleinpeace.com" className="text-blue-600 hover:underline">legal@settleinpeace.com</a><br />
              Mail: Settle In Peace, Inc., [Business Address]
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center">
          <p className="text-sm text-zinc-400">© {new Date().getFullYear()} Settle In Peace, Inc. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
