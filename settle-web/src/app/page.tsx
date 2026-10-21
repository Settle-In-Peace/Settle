import Link from 'next/link';
import ComplianceDisclosure from '../components/ComplianceDisclosure';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black font-sans">

      {/* ============================================================
          HERO SECTION
          - Honest value proposition (we're new, here's why we're different)
          - Mini qualification widget above the fold
          - No fake trust badges — just what's true
          ============================================================ */}
      <section className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-green-400 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Left: Headline + CTA */}
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Now in early access
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] mb-6">
                Settle your debt.<br />
                <span className="text-green-300">Find your peace.</span>
              </h1>

              <p className="text-xl text-blue-100 mb-8 max-w-lg leading-relaxed">
                We're building the first marketplace for debt relief. Take the free assessment to join early access — we'll match you with providers as our network grows.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link
                  href="/assessment"
                  className="px-8 py-4 bg-white text-blue-700 text-lg font-bold rounded-xl hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                  Take the Free Assessment →
                </Link>
                <Link
                  href="/providers"
                  className="px-8 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white text-lg font-semibold rounded-xl hover:bg-white/20 transition-all"
                >
                  Join as a Provider
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-blue-100">
                <span className="flex items-center gap-1.5"><CheckIcon /> Free assessment</span>
                <span className="flex items-center gap-1.5"><CheckIcon /> No credit check</span>
                <span className="flex items-center gap-1.5"><CheckIcon /> No obligation</span>
                <span className="flex items-center gap-1.5"><CheckIcon /> 2 minutes</span>
              </div>
            </div>

            {/* Right: Mini qualification widget */}
            <div className="bg-white rounded-2xl shadow-2xl p-6 lg:p-8 text-zinc-900">
              <div className="text-center mb-5">
                <h2 className="text-xl font-bold text-zinc-900">Check your eligibility in 60 seconds</h2>
                <p className="text-sm text-zinc-500 mt-1">Start with your total debt — no personal info needed yet</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-zinc-700">How much do you owe?</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: 'Under $7.5K', value: '5000' },
                    { label: '$7.5K – $15K', value: '10000' },
                    { label: '$15K – $25K', value: '20000' },
                    { label: '$25K – $50K', value: '35000' },
                    { label: '$50K – $100K', value: '75000' },
                    { label: 'Over $100K', value: '125000' },
                  ].map(opt => (
                    <Link
                      key={opt.value}
                      href={`/assessment?debt=${opt.value}`}
                      className="py-2.5 px-3 rounded-lg border-2 border-zinc-200 text-center text-sm font-medium text-zinc-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-all"
                    >
                      {opt.label}
                    </Link>
                  ))}
                </div>

                <Link
                  href="/assessment"
                  className="block w-full py-3.5 bg-blue-600 text-white text-center font-bold rounded-xl hover:bg-blue-700 transition-all mt-4"
                >
                  Get My Free Assessment →
                </Link>

                <p className="text-xs text-center text-zinc-400 mt-2">
                  🔒 Your information is secure & confidential
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          "WHY WE'RE DIFFERENT" SECTION
          - Our unique marketplace angle
          - Honest about being new — that's the differentiator
          ============================================================ */}
      <section className="py-20 px-4 bg-white dark:bg-black">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide mb-3">Why Settle In Peace is different</p>
            <h2 className="text-3xl sm:text-4xl font-black text-black dark:text-white mb-4">
              Other sites send you to one company.<br />
              <span className="text-blue-600">We're building a marketplace.</span>
            </h2>
            <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
              Think of us like Kayak or LendingTree — but for debt relief. Enter your situation once, see multiple providers compete, compare real offers, and choose what's right for you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '⚖️',
                title: 'True Side-by-Side Comparison',
                desc: 'Once providers join, see multiple offers with fees, average savings, timelines, and consumer reviews — all in one place. No more calling 5 different companies.',
                badge: 'No one else does this',
              },
              {
                icon: '🔍',
                title: 'Full Cost Disclosure',
                desc: 'Fees, tax implications on forgiven debt, and credit score impact are shown upfront when providers share them. No surprises after you sign.',
                badge: 'What competitors hide',
              },
              {
                icon: '🤝',
                title: 'You Stay in Control',
                desc: 'No high-pressure sales calls. Providers come to you with their best offer. Review, ask questions, and choose on your own timeline.',
                badge: 'No pressure, ever',
              },
            ].map(item => (
              <div key={item.title} className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-100 dark:border-zinc-800">
                <div className="text-4xl mb-4">{item.icon}</div>
                <div className="inline-block text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full mb-3">
                  {item.badge}
                </div>
                <h3 className="text-lg font-bold text-black dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          "HOW IT WORKS" SECTION
          - 4-step visual process
          ============================================================ */}
      <section className="py-20 px-4 bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-black dark:text-white mb-4">How it works</h2>
            <p className="text-lg text-zinc-500 dark:text-zinc-400">From stressed to settled in 4 simple steps</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', icon: '📝', title: 'Take the assessment', desc: 'Answer 7 quick questions about your debt. No SSN, no credit check, no obligation.' },
              { step: '2', icon: '🎯', title: 'Get matched', desc: 'Once providers join, we match your profile to providers for your specific situation.' },
              { step: '3', icon: '⚖️', title: 'Compare offers', desc: 'Compare real fees, timelines, and savings side-by-side as providers come online.' },
              { step: '4', icon: '🕊️', title: 'Choose your path', desc: "Enroll with a provider when ready, or use our coaching tools while you wait." },
            ].map((item, idx) => (
              <div key={item.step} className="relative text-center">
                {idx < 3 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-full h-0.5 bg-gradient-to-r from-blue-300 to-transparent" />
                )}
                <div className="relative inline-flex w-24 h-24 bg-white dark:bg-zinc-900 rounded-2xl shadow-md items-center justify-center mb-4">
                  <span className="text-4xl">{item.icon}</span>
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-blue-600 text-white text-sm font-black rounded-full flex items-center justify-center">
                    {item.step}
                  </div>
                </div>
                <h3 className="font-bold text-black dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/assessment"
              className="inline-block px-10 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              Start My Free Assessment →
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================
          MARKETPLACE CONCEPT SECTION
          - Shows how the marketplace WILL work
          - Honest that we're building this, not live yet
          ============================================================ */}
      <section className="py-20 px-4 bg-white dark:bg-black">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide mb-3">The marketplace advantage</p>
            <h2 className="text-3xl sm:text-4xl font-black text-black dark:text-white mb-4">
              Compare real providers side by side
            </h2>
            <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
              Once our first providers are live, you'll see fees, consumer ratings, and real timelines all in one place.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-100 dark:border-zinc-800 p-12 text-center max-w-3xl mx-auto">
            <h3 className="text-xl font-bold text-black dark:text-white mb-3">Our provider network is being built</h3>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto">
              We're onboarding debt relief providers. Check the{' '}
              <Link href="/compare" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700">
                marketplace page
              </Link>{' '}
              for live comparisons as soon as they join.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          SAVINGS ESTIMATOR SECTION
          - Honest estimates based on industry averages, not our results
          ============================================================ */}
      <section className="py-20 px-4 bg-gradient-to-br from-green-50 to-blue-50 dark:from-zinc-950 dark:to-zinc-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-black dark:text-white mb-4">
            See how much you could save
          </h2>
          <p className="text-lg text-zinc-500 dark:text-zinc-400 mb-10">
            Industry data shows debt settlement programs typically reduce enrolled debt by 40-60%. Here's what that could look like.
          </p>

          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mb-10">
            {[
              { debt: '$15,000', saved: '$6,750', after: '$8,250' },
              { debt: '$30,000', saved: '$13,500', after: '$16,500' },
              { debt: '$50,000', saved: '$22,500', after: '$27,500' },
            ].map(item => (
              <div key={item.debt} className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-md">
                <div className="text-sm text-zinc-500 mb-1">If you owe</div>
                <div className="text-2xl font-black text-zinc-900 dark:text-white mb-3">{item.debt}</div>
                <div className="text-sm text-green-600 font-semibold mb-1">You could save</div>
                <div className="text-3xl font-black text-green-600 mb-3">{item.saved}</div>
                <div className="text-xs text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                  Pay back approx <strong className="text-zinc-700 dark:text-zinc-300">{item.after}</strong>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-zinc-400 mb-6 max-w-xl mx-auto">
            * Estimates based on industry averages from the American Fair Credit Council (AFCC). Individual results vary based on your specific situation and provider. Forgiven debt over $600 may be taxable. We are not a direct debt settlement provider.
          </p>

          <Link
            href="/assessment"
            className="inline-block px-10 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg"
          >
            Get My Personalized Assessment →
          </Link>
        </div>
      </section>

      {/* ============================================================
          DEBT TYPES SECTION
          ============================================================ */}
      <section className="py-20 px-4 bg-white dark:bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black text-black dark:text-white mb-4">What types of debt do we cover?</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-10">Our providers specialize across all major unsecured debt categories.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: '💳', label: 'Credit Card Debt', desc: 'Visa, Mastercard, Amex, store cards' },
              { icon: '🏥', label: 'Medical Bills', desc: 'Hospital, doctor, dental bills' },
              { icon: '🏦', label: 'Personal Loans', desc: 'Unsecured installment loans' },
              { icon: '🎓', label: 'Student Loans', desc: 'Private student loan debt' },
              { icon: '💼', label: 'Business Debt', desc: 'Personal-guaranteed business debt' },
              { icon: '📋', label: 'Collections', desc: 'Accounts in collections' },
            ].map(item => (
              <div
                key={item.label}
                className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800 text-left"
              >
                <span className="text-3xl flex-shrink-0">{item.icon}</span>
                <div>
                  <div className="font-bold text-black dark:text-white text-sm">{item.label}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          EARLY ACCESS / JOIN SECTION
          - Honest about being new — frame as advantage
          - No fake testimonials
          ============================================================ */}
      <section className="py-20 px-4 bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            We're just getting started
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-black dark:text-white mb-4">
            Be one of our first success stories
          </h2>
          <p className="text-lg text-zinc-500 dark:text-zinc-400 mb-10 max-w-2xl mx-auto">
            We're a new company with a simple mission: bring transparency to debt relief. No fake reviews, no inflated stats, no pressure. Just an honest assessment of your options. Take the assessment today and we'll match you with providers as our network grows.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: '🌱',
                title: 'We\'re new, and that\'s good',
                desc: 'No bloated corporate overhead. No call center quotas. We built this because the industry needs transparency, and we answer directly to you.',
              },
              {
                icon: '🔒',
                title: 'Your data stays yours',
                desc: 'We don\'t sell your information. We match you with providers only when you ask us to. You can delete your account and data anytime.',
              },
              {
                icon: '💬',
                title: 'We listen to our early users',
                desc: 'As one of our first members, your feedback directly shapes what we build. Tell us what you need and we\'ll prioritize it.',
              },
            ].map(item => (
              <div key={item.title} className="bg-white dark:bg-zinc-900 rounded-2xl p-6 text-left border border-zinc-100 dark:border-zinc-800">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-bold text-black dark:text-white text-sm mb-2">{item.title}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <Link
            href="/assessment"
            className="inline-block px-10 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg"
          >
            Take the Free Assessment →
          </Link>
        </div>
      </section>

      {/* ============================================================
          FAQ SECTION — compact two-column grid
          ============================================================ */}
      <section className="py-16 px-4 bg-white dark:bg-black">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-black dark:text-white text-center mb-8">Frequently asked questions</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              {
                q: 'Is this really free?',
                a: 'Yes. Our assessment, comparison tools, and provider matching are 100% free for consumers. We get paid by providers when they successfully help you, never by you.',
              },
              {
                q: 'Are you a debt settlement company?',
                a: 'No. We are a marketplace that connects you with third-party debt relief companies. We do not negotiate on your behalf or hold your funds.',
              },
              {
                q: 'How is this different from other debt relief sites?',
                a: "Other sites send your info to one company. We show you multiple providers side-by-side — fees, timelines, and success rates — so you choose instead of being sold to.",
              },
              {
                q: 'You\'re a new company. Can I trust you?',
                a: "Fair question. We're upfront about being new — no fake stats, no high-pressure sales, no hidden fees. We make money when providers pay us for leads, and we disclose that openly.",
              },
              {
                q: 'Will this affect my credit score?',
                a: 'Debt settlement can negatively impact your credit score short-term. Providers disclose this upfront, and many clients see scores recover after becoming debt-free.',
              },
              {
                q: 'What if I don\'t qualify for debt settlement?',
                a: "If your debt is under $7,500 or you don't qualify, we plan to offer a financial coaching subscription with budgeting tools, debt payoff calculators, and credit monitoring.",
              },
              {
                q: 'Are the providers on your platform screened?',
                a: 'Providers are asked to confirm state licensing, BBB ratings, and AFCC or IAPDA membership. Reported success rates are shown on their profiles.',
              },
              {
                q: 'How long does the process take?',
                a: 'The assessment takes 2 minutes. Most debt settlement programs run 24-48 months. We show each provider\'s average timeline upfront so you can choose what works for you.',
              },
            ].map((faq, idx) => (
              <details key={idx} className="group bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer font-semibold text-sm text-black dark:text-white list-none">
                  {faq.q}
                  <span className="text-blue-600 text-lg flex-shrink-0 transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="px-4 pb-3 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          FOR PROVIDERS SECTION
          - B2B CTA (our two-sided marketplace)
          ============================================================ */}
      <section className="py-20 px-4 bg-gradient-to-br from-indigo-600 to-blue-700 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-indigo-200 text-sm font-semibold uppercase tracking-wide mb-3">For Debt Relief Companies</p>
          <h2 className="text-3xl sm:text-4xl font-black mb-4">Access pre-qualified, intent-driven leads</h2>
          <p className="text-indigo-100 text-lg mb-8 max-w-xl mx-auto">
            Our consumers complete a full 7-step assessment with TCPA consent before you ever contact them. Higher intent. Better conversions. No wasted calls.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/providers"
              className="px-8 py-4 bg-white text-blue-700 font-bold text-lg rounded-xl hover:bg-blue-50 transition-all shadow-lg"
            >
              Learn About Lead Access →
            </Link>
            <Link
              href="/providers"
              className="px-8 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white font-semibold text-lg rounded-xl hover:bg-white/20 transition-all"
            >
              See Pricing Plans
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================
          PORTAL LOGIN SECTION
          - Visible entry points for consumers, providers, sales, admin
          ============================================================ */}
      <section className="py-16 px-4 bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide mb-3">Team & Partner Access</p>
            <h2 className="text-3xl sm:text-4xl font-black text-black dark:text-white mb-4">Log in to your portal</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
              Consumers, providers, sales agents, and administrators each have a dedicated portal to manage their experience.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: 'Consumer Login',
                desc: 'View your debts, assessment results, and provider matches.',
                href: '/login',
                cta: 'Log In',
              },
              {
                title: 'Provider Portal',
                desc: 'Access matched leads, manage your profile, and purchase credits.',
                href: '/login',
                cta: 'Provider Login',
              },
              {
                title: 'Sales CRM',
                desc: 'Manage leads, track outreach, and update pipeline status.',
                href: '/sales/login',
                cta: 'Sales Login',
              },
              {
                title: 'Admin Dashboard',
                desc: 'Oversee users, providers, collections, and platform settings.',
                href: '/login',
                cta: 'Admin Login',
              },
            ].map((portal) => (
              <div
                key={portal.title}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">{portal.title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 flex-grow">{portal.desc}</p>
                <Link
                  href={portal.href}
                  className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {portal.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          FINAL CTA SECTION
          ============================================================ */}
      <section className="py-24 px-4 bg-white dark:bg-black text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Take the first step today
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-black dark:text-white mb-4">
            Ready to settle in peace?
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-lg">
            Take our free 2-minute assessment and see which options are available to you — with no pressure and no commitment.
          </p>
          <Link
            href="/assessment"
            className="inline-block px-12 py-5 bg-blue-600 text-white text-xl font-black rounded-xl hover:bg-blue-700 transition-all shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-1"
          >
            Get My Free Assessment →
          </Link>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-400 dark:text-zinc-600">
            <span>✓ Free</span>
            <span>✓ No credit check</span>
            <span>✓ No obligation</span>
            <span>✓ 2 minutes</span>
            <span>✓ 100% confidential</span>
          </div>
          <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-600">
            Not sure if you qualify?{' '}
            <Link href="/compare" className="text-blue-500 hover:underline font-medium">See how the marketplace works →</Link>
          </p>
        </div>
      </section>

      {/* Compliance disclosures */}
      <section className="py-12 px-4 bg-white dark:bg-black">
        <div className="max-w-3xl mx-auto">
          <ComplianceDisclosure />
        </div>
      </section>
    </div>
  );
}

/* ============================================================
    INLINE ICON COMPONENTS
    ============================================================ */

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-300" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}
