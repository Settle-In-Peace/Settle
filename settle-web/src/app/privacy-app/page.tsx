import Link from 'next/link';

export const metadata = {
  title: 'Mobile App Privacy Policy | Settle In Peace',
  description:
    'Privacy policy for the Settle In Peace mobile app — what the app collects, how debt-assessment data is shared with providers (only with your consent), and how to delete your data.',
};

export default function AppPrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
          ← Back to home
        </Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">
          Mobile App Privacy Policy
        </h1>
        <p className="text-zinc-500 mb-12">Last updated: October 24, 2026</p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">1. Scope</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This Mobile App Privacy Policy applies to the Settle In Peace mobile application
              (the &quot;App&quot;) operated by Settle In Peace, Inc. (&quot;we,&quot;
              &quot;us,&quot; &quot;our&quot;). It supplements our{' '}
              <Link href="/privacy" className="text-blue-600 hover:underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/disclosures" className="text-blue-600 hover:underline">
                Compliance Disclosures
              </Link>
              , which govern all of our services. Settle In Peace is a marketplace that connects
              consumers with third-party debt relief providers — we are not a law firm, not a debt
              settlement provider, and not a financial advisor.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              2. Information the App Collects
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <strong className="text-zinc-800 dark:text-zinc-200">Account information.</strong>{' '}
              Name, email address, phone number, and credentials used to sign in.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong className="text-zinc-800 dark:text-zinc-200">
                Debt assessment information (sensitive).
              </strong>{' '}
              If you complete our assessment in the App, we collect the information you provide
              about your debts — approximate balances, debt types, creditor names, income range,
              and hardship details. This is sensitive financial information; we treat it
              accordingly and share it only as described below.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong className="text-zinc-800 dark:text-zinc-200">Device &amp; usage data.</strong>{' '}
              Device model, OS version, app version, push-notification tokens, crash diagnostics,
              and feature-usage events used to operate and improve the App.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong className="text-zinc-800 dark:text-zinc-200">Communications.</strong>{' '}
              Messages you send through the App and your communication preferences (including SMS
              opt-in status).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              3. How the App Uses Information
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li>Provide your assessment results, provider comparisons, and account features;</li>
              <li>Match you with debt relief providers when you ask to be connected;</li>
              <li>Send push notifications and messages about your account and matched providers;</li>
              <li>Send transactional SMS/email (verification codes, provider introductions) via our messaging providers;</li>
              <li>Secure your account, prevent fraud, and enforce our terms;</li>
              <li>Analyze aggregated usage to improve the App.</li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              We do <strong className="text-zinc-800 dark:text-zinc-200">not</strong> sell your
              personal information to data brokers, and we do not use app data for third-party
              advertising.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              4. Sharing With Providers — Only With Your Consent
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Your contact information and assessment details are shared with a partner debt
              relief provider <strong>only when you consent to be contacted</strong> during the
              assessment or matching flow. That consent also constitutes a TCPA opt-in: the
              matched provider may contact you by phone, text, or email about debt relief
              services. See our{' '}
              <Link href="/disclosures" className="text-blue-600 hover:underline">
                Compliance Disclosures
              </Link>{' '}
              for details on how we are compensated by providers and your rights under the FTC
              Telemarketing Sales Rule.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              You may withdraw consent at any time by replying &quot;STOP&quot; to texts, using
              email unsubscribe links, or contacting us — this does not affect sharing that
              already occurred with a provider you were matched to; contact that provider
              directly to stop their outreach.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              5. Service Providers
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              We share app data with vendors that run the service under contract: secure
              hosting/database infrastructure, push-notification delivery (Apple/Google),
              transactional SMS (Telnyx) and email providers, and analytics. Providers and vendors
              may use the data only to serve you or us — not for their own marketing lists beyond
              the introduction you consented to.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              6. Retention &amp; Deletion
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              We keep your information while your account is active and as needed for legal,
              compliance, and record-keeping purposes (including records of your consent). To
              delete your account and personal data, email{' '}
              <a
                href="mailto:privacy@settleinpeace.com"
                className="text-blue-600 hover:underline"
              >
                privacy@settleinpeace.com
              </a>{' '}
              from your account address. <strong>Deleting the App does not delete your
              account</strong> — use a deletion request.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              7. Your Privacy Rights
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Depending on your state (including California under the CCPA/CPRA), you may have
              rights to access, correct, delete, or port your personal information, and to opt out
              of certain sharing. Submit requests to{' '}
              <a
                href="mailto:privacy@settleinpeace.com"
                className="text-blue-600 hover:underline"
              >
                privacy@settleinpeace.com
              </a>
              ; we verify requests before acting. Full details are in our{' '}
              <Link href="/privacy" className="text-blue-600 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              8. Children &amp; Security
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              The App is not directed to children under 18, and we do not knowingly collect their
              personal information. We use encryption in transit, access controls, and secure
              hosting to protect your data — including the sensitive financial information in
              assessments.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              9. Changes &amp; Contact
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              The current version of this policy is always posted at{' '}
              <Link href="/privacy-app" className="text-blue-600 hover:underline">
                settleinpeace.com/privacy-app
              </Link>
              . Questions:{' '}
              <a
                href="mailto:privacy@settleinpeace.com"
                className="text-blue-600 hover:underline"
              >
                privacy@settleinpeace.com
              </a>{' '}
              or{' '}
              <a href="mailto:help@settleinpeace.com" className="text-blue-600 hover:underline">
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
