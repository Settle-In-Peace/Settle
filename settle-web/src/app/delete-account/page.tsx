import Link from 'next/link';

export const metadata = {
  title: 'Delete Your Account | Settle In Peace',
  description:
    'How to delete your Settle In Peace account and personal data — in-app deletion plus an email request path.',
  alternates: { canonical: '/delete-account' },
};

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">
          ← Back to home
        </Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">
          Delete Your Account
        </h1>
        <p className="text-zinc-500 mb-12">Last updated: November 14, 2026</p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              Delete inside the app
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              The fastest way to delete your Settle In Peace account is inside the mobile app:
              sign in, open the <strong>Profile</strong> tab, scroll to{' '}
              <strong>Delete Account</strong>, and confirm. This permanently deletes your account
              and the personal data attached to it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              Request deletion by email
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If you can&apos;t sign in — or you already removed the app — email{' '}
              <a
                href="mailto:privacy@settleinpeace.com"
                className="text-blue-600 hover:underline"
              >
                privacy@settleinpeace.com
              </a>{' '}
              from the address on your account with the subject{' '}
              <strong>&quot;Delete my account&quot;</strong>. We verify the request against your
              account address before acting and confirm by reply email.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              <strong>Deleting the app does not delete your account</strong> — use one of the
              methods above.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">
              What gets deleted
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Deletion removes your profile (name, email, phone number, credentials) and any debt
              assessment information you provided — approximate balances, debt types, creditor
              names, income range, and hardship details — along with your app activity and
              preferences.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              Some records may be retained where the law requires it — for example records of
              consent, fraud-prevention logs, or data already shared with a debt relief provider
              at your request (that provider&apos;s own retention policy then applies to their
              copy). Details are in our{' '}
              <Link href="/privacy-app" className="text-blue-600 hover:underline">
                Mobile App Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">Questions</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Email{' '}
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
