import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | Settle In Peace',
  description: 'Privacy Policy for Settle In Peace — how we collect, use, and protect your data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-8 inline-block">← Back to home</Link>
        <h1 className="text-4xl font-black text-black dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-zinc-500 mb-12">Last updated: July 7, 2026</p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">1. Introduction</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Settle In Peace, Inc. (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services (the &quot;Service&quot;). We are a marketplace that connects consumers with debt relief providers.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              We do not sell your personal information to unaffiliated third parties. We share your information with partner providers only when you consent to be contacted.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">2. Information We Collect</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3"><strong>Information you provide directly:</strong></p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li><strong>Assessment data:</strong> Total debt amount, debt types, payment status, employment status, monthly income, state, and ZIP code</li>
              <li><strong>Contact information:</strong> First name, last name, email address, phone number, and state of residence</li>
              <li><strong>Account data:</strong> Email, password (hashed), and profile information if you create an account</li>
              <li><strong>Consent records:</strong> TCPA consent status, consent timestamp, and consent language</li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3 mb-3"><strong>Information collected automatically:</strong></p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li><strong>Usage data:</strong> IP address, browser type, device information, pages visited, and referring URLs</li>
              <li><strong>Cookies and tracking:</strong> Session cookies for authentication and analytics cookies for understanding Service usage</li>
              <li><strong>Source tracking:</strong> UTM parameters, referral source, and marketing campaign data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li>To process your debt assessment and match you with appropriate debt relief providers</li>
              <li>To share your information with partner providers when you provide TCPA consent</li>
              <li>To communicate with you about your assessment results and provider matches</li>
              <li>To create and manage your account if you choose to register</li>
              <li>To improve our Service, including assessment accuracy and provider matching algorithms</li>
              <li>To comply with legal obligations, including TCPA and state debt relief regulations</li>
              <li>To detect, prevent, and address fraud or security issues</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">4. How We Share Your Information</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
              <strong>With partner providers:</strong> When you complete the assessment and provide TCPA consent, we share your contact information and assessment data with matched debt relief providers so they can contact you with personalized offers. We only share your information with providers who are licensed in your state and meet our vetting criteria.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
              <strong>Service providers:</strong> We use third-party services to operate our platform, including hosting (Railway, Render), email delivery (Resend), and analytics. These providers have access to your information only to perform services on our behalf and are obligated to protect your data.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
              <strong>Legal compliance:</strong> We may disclose your information when required by law, court order, or government regulation, or to protect our legal rights.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <strong>We do NOT:</strong> Sell your personal information to data brokers, share your information for marketing purposes with non-partner companies, or rent your contact data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">5. Data Security</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              We implement industry-standard security measures to protect your information, including: 256-bit SSL/TLS encryption for all data in transit, hashed passwords using bcrypt, secure database hosting with access controls, and regular security reviews. However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">6. Data Retention</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              We retain your assessment data and contact information for as long as your account is active or as needed to provide services. Lead data is retained for a minimum of 5 years to comply with TCPA record-keeping requirements. You may request deletion of your account and personal data at any time by contacting us at <a href="mailto:privacy@settleinpeace.com" className="text-blue-600 hover:underline">privacy@settleinpeace.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">7. Your Rights</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">Depending on your state of residence, you may have the following rights:</p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal retention requirements)</li>
              <li><strong>Opt-out:</strong> Unsubscribe from communications at any time</li>
              <li><strong>Data portability:</strong> Request your data in a portable, machine-readable format</li>
              <li><strong>Non-discrimination:</strong> We will not discriminate against you for exercising your privacy rights</li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              To exercise any of these rights, contact us at <a href="mailto:privacy@settleinpeace.com" className="text-blue-600 hover:underline">privacy@settleinpeace.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">8. California Privacy Rights (CCPA/CPRA)</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA), including the right to know what personal information is collected, the right to delete personal information, the right to opt-out of the sale of personal information, and the right to non-discrimination. We do not sell personal information as defined by the CCPA. For California-specific requests, contact us at <a href="mailto:privacy@settleinpeace.com" className="text-blue-600 hover:underline">privacy@settleinpeace.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">9. Children&apos;s Privacy</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Our Service is not directed to individuals under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately and we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">10. Cookies Policy</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">We use the following types of cookies:</p>
            <ul className="list-disc pl-6 space-y-2 text-zinc-600 dark:text-zinc-400">
              <li><strong>Essential cookies:</strong> Required for authentication and core functionality</li>
              <li><strong>Analytics cookies:</strong> Help us understand how visitors use our Service</li>
              <li><strong>Marketing cookies:</strong> Used to track the effectiveness of our marketing campaigns</li>
            </ul>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mt-3">
              You can control cookies through your browser settings. Disabling essential cookies may affect Service functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">11. Third-Party Links</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Our Service may contain links to third-party websites, including debt relief provider websites. We are not responsible for the privacy practices or content of these third-party sites. We encourage you to review the privacy policies of any third-party sites you visit.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">12. Changes to This Policy</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page with a new &quot;Last updated&quot; date. We encourage you to review this policy periodically.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-3">13. Contact Us</h2>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, please contact us at:<br /><br />
              Email: <a href="mailto:privacy@settleinpeace.com" className="text-blue-600 hover:underline">privacy@settleinpeace.com</a><br />
              Mail: Settle In Peace, Inc., [Business Address]<br />
              Phone: [Business Phone]
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
