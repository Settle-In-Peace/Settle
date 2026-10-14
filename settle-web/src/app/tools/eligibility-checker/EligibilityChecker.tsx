'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { STATES, type StateInfo } from '../../../content/states';

// ── Question model ──────────────────────────────────────────────────────

type BehindStatus = 'current' | '1-2' | '3+' | 'collections';

interface Answers {
  stateSlug: string;
  debtRange: string; // midpoint key
  debtTypes: string[];
  behind: BehindStatus | '';
  hardship: boolean | null;
  homeowner: boolean | null;
}

const DEBT_RANGES = [
  { label: 'Under $5,000', mid: 3500 },
  { label: '$5,000 – $10,000', mid: 7500 },
  { label: '$10,000 – $25,000', mid: 17500 },
  { label: '$25,000 – $50,000', mid: 37500 },
  { label: '$50,000 – $100,000', mid: 75000 },
  { label: 'Over $100,000', mid: 125000 },
];

const DEBT_TYPES = [
  { value: 'credit_card', label: 'Credit cards' },
  { value: 'medical', label: 'Medical bills' },
  { value: 'collections', label: 'Collections / charge-offs' },
  { value: 'personal_loan', label: 'Personal loans' },
  { value: 'payday', label: 'Payday / high-interest loans' },
  { value: 'other', label: 'Other unsecured debt' },
];

const BEHIND_OPTIONS: { value: BehindStatus; label: string }[] = [
  { value: 'current', label: "I'm current on all payments" },
  { value: '1-2', label: '1–2 months behind' },
  { value: '3+', label: '3+ months behind' },
  { value: 'collections', label: 'In collections or being sued' },
];

const STEPS = [
  { id: 'state', label: 'Your state' },
  { id: 'amount', label: 'Debt amount' },
  { id: 'types', label: 'Debt types' },
  { id: 'behind', label: 'Payments' },
  { id: 'hardship', label: 'Hardship' },
  { id: 'home', label: 'Housing' },
] as const;

// ── Results model ───────────────────────────────────────────────────────

interface ReliefOption {
  key: string;
  name: string;
  score: number;
  tagline: string;
  whyFits: string[];
  watchOut: string[];
  learnHref: string;
  learnLabel: string;
}

function scoreOptions(a: Answers, state: StateInfo | undefined): ReliefOption[] {
  const debt = DEBT_RANGES.find((r) => r.label === a.debtRange)?.mid ?? 0;
  const behind = a.behind;
  const hardship = a.hardship === true;
  const homeowner = a.homeowner === true;

  // Debt settlement
  const settlement: ReliefOption = {
    key: 'settlement',
    name: 'Debt settlement',
    score: 0,
    tagline: 'Negotiating with creditors to accept less than the full balance owed.',
    whyFits: [],
    watchOut: [],
    learnHref: '/learn/what-is-debt-settlement',
    learnLabel: 'How debt settlement works',
  };
  if (debt >= 10000) {
    settlement.score += 40;
    settlement.whyFits.push(
      'Most settlement programs require roughly $7,500–$10,000 in unsecured debt — you appear to be in range.',
    );
  } else if (debt >= 7500) {
    settlement.score += 25;
    settlement.whyFits.push(
      "You're near the typical $7,500 minimum for settlement programs — some providers may accept you.",
    );
  } else {
    settlement.score += 5;
    settlement.watchOut.push(
      'Most settlement companies require at least $7,500–$10,000 in unsecured debt — your amount may be below program minimums.',
    );
  }
  if (behind === '3+' || behind === 'collections') {
    settlement.score += 30;
    settlement.whyFits.push(
      "Settlement is typically aimed at people already behind — being delinquent is often when creditors negotiate.",
    );
  } else if (behind === '1-2') {
    settlement.score += 15;
  }
  if (hardship) {
    settlement.score += 20;
    settlement.whyFits.push(
      'Settlement programs ask you to save into a dedicated account instead of paying creditors — a documented hardship is the usual context.',
    );
  }
  settlement.watchOut.push(
    'Usually lowers your credit score in the short term, forgiven amounts over $600 may be taxable (1099-C), and no creditor is required to negotiate — outcomes are never guaranteed.',
  );

  // Nonprofit credit counseling / DMP
  const dmp: ReliefOption = {
    key: 'dmp',
    name: 'Nonprofit credit counseling (DMP)',
    score: 0,
    tagline:
      'A Debt Management Plan through a nonprofit agency — one monthly payment, often with reduced interest rates.',
    whyFits: [],
    watchOut: [],
    learnHref: '/compare',
    learnLabel: 'Compare counseling and relief providers',
  };
  if (debt > 0 && debt <= 50000) {
    dmp.score += 30;
    dmp.whyFits.push('DMPs commonly handle unsecured debts in your range.');
  } else if (debt > 50000) {
    dmp.score += 15;
  }
  if (behind === 'current' || behind === '1-2') {
    dmp.score += 25;
    dmp.whyFits.push(
      'Being current or only slightly behind usually means more creditors will work with a counseling agency.',
    );
  }
  if (!hardship) {
    dmp.score += 25;
    dmp.whyFits.push(
      'A DMP needs a reliable monthly payment for 3–5 years — steady income is the biggest eligibility factor.',
    );
  } else {
    dmp.score += 5;
    dmp.watchOut.push(
      'A DMP requires consistent monthly payments — if your income has dropped, the plan may not be sustainable.',
    );
  }
  dmp.watchOut.push(
    'Enrolled cards are usually closed, and you commit to payments for 3–5 years. Counseling sessions are free or low-cost through NFCC-member agencies.',
  );

  // Bankruptcy attorney consult
  const bankruptcy: ReliefOption = {
    key: 'bankruptcy',
    name: 'Bankruptcy attorney consultation',
    score: 0,
    tagline:
      'A free or low-cost consult with a licensed attorney about Chapter 7 or 13 — a consultation is not a commitment to file.',
    whyFits: [],
    watchOut: [],
    learnHref: '/learn/bankruptcy-vs-debt-settlement',
    learnLabel: 'Bankruptcy vs. debt settlement',
  };
  if (debt >= 50000) bankruptcy.score += 40;
  else if (debt >= 25000) bankruptcy.score += 30;
  else bankruptcy.score += 10;
  if (behind === 'collections') {
    bankruptcy.score += 25;
    bankruptcy.whyFits.push(
      "If you're being sued or wages are at risk, an attorney can tell you quickly whether legal protection applies — filing can stop most collection actions.",
    );
  }
  if (hardship) {
    bankruptcy.score += 15;
    bankruptcy.whyFits.push(
      'A major income disruption is the most common reason people explore whether a discharge fits their situation.',
    );
  }
  if (debt >= 25000 || behind === 'collections' || hardship) {
    bankruptcy.whyFits.push(
      'Most bankruptcy attorneys offer a free initial consult — it costs nothing to learn where you stand.',
    );
  }
  if (homeowner) {
    bankruptcy.whyFits.push(
      `As a homeowner, ${state?.name ?? 'your state'}'s homestead exemption rules determine whether your equity is protected — that alone is worth a professional opinion.`,
    );
  }
  bankruptcy.watchOut.push(
    'The most serious credit impact of any option (7–10 years on reports), but it can discharge qualifying debts entirely. Always talk to a licensed attorney in your state — never rely on general information for a filing decision.',
  );

  // DIY payoff / negotiation
  const diy: ReliefOption = {
    key: 'diy',
    name: 'DIY payoff & creditor negotiation',
    score: 0,
    tagline:
      'Calling creditors yourself for hardship programs or settlements, then attacking balances with a payoff plan.',
    whyFits: [],
    watchOut: [],
    learnHref: '/learn/how-to-negotiate-with-creditors',
    learnLabel: 'Script: how to negotiate with creditors',
  };
  if (debt <= 10000) {
    diy.score += 40;
    diy.whyFits.push(
      'Below typical program minimums, self-negotiation plus a structured payoff plan is often the most cost-effective path.',
    );
  }
  if (behind === 'current') {
    diy.score += 25;
    diy.whyFits.push(
      "While you're still current, you can ask for hardship rates and payment plans without settling.",
    );
  }
  if (!hardship) {
    diy.score += 20;
    diy.whyFits.push(
      'Steady income means an avalanche or snowball plan can make real progress month over month.',
    );
  }
  diy.whyFits.push('Free to try before you pay anyone — many creditors have unadvertised hardship programs.');
  if (debt > 25000 || behind === '3+' || behind === 'collections') {
    diy.watchOut.push(
      'With this amount or level of delinquency, DIY may not be enough on its own — treat it as a first step, not the whole plan.',
    );
  } else {
    diy.watchOut.push(
      'Requires discipline and a written budget — the payoff plan only works if you can stick to it.',
    );
  }

  return [settlement, dmp, bankruptcy, diy].sort((x, y) => y.score - x.score);
}

function fitLabel(score: number): { text: string; cls: string } {
  if (score >= 55)
    return {
      text: 'Strong option to explore',
      cls: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900',
    };
  if (score >= 30)
    return {
      text: 'Possible fit',
      cls: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-900',
    };
  return {
    text: 'Less likely — still worth knowing',
    cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
  };
}

// ── Email capture (no newsletter endpoint exists yet — stored locally and
// handed off to the state guide + full assessment) ───────────────────────

const CAPTURE_KEY = 'settle_eligibility_capture';

function EmailCapture({ state }: { state: StateInfo }) {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      setErr('Enter a valid email address.');
      return;
    }
    try {
      localStorage.setItem(
        CAPTURE_KEY,
        JSON.stringify({ email: v, stateSlug: state.slug, capturedAt: new Date().toISOString() }),
      );
    } catch {
      /* private mode — still show the guide link */
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-6">
        <h3 className="font-bold text-green-900 dark:text-green-200 mb-2">You&apos;re set.</h3>
        <p className="text-sm text-green-800 dark:text-green-300 mb-4">
          Your {state.name} guide is ready — it covers {state.name} collection time limits, free
          local resources, and every option above in more depth.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/debt-relief/${state.slug}`}
            className="inline-block rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Read the {state.name} guide →
          </Link>
          <Link
            href="/assessment"
            className="inline-block rounded-xl border border-green-600 px-5 py-2.5 text-sm font-semibold text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950 transition-colors"
          >
            Continue to full assessment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
    >
      <h3 className="font-bold text-black dark:text-white mb-1">
        Save your results + get the {state.name} guide
      </h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
        Enter your email to save these results and unlock your {state.name} state guide. No phone
        calls, no obligation.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErr('');
          }}
          placeholder="you@example.com"
          className="flex-1 px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Get my results
        </button>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{err}</p>}
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">
        We never sell your information. Educational content only — not legal or financial advice.
      </p>
    </form>
  );
}

// ── Wizard ──────────────────────────────────────────────────────────────

const OPTION_BTN =
  'w-full py-4 px-5 rounded-xl border-2 text-left font-medium transition-all flex items-center justify-between';
const OPTION_OFF = 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-400';
const OPTION_ON = 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300';

export default function EligibilityChecker() {
  const [step, setStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [a, setA] = useState<Answers>({
    stateSlug: '',
    debtRange: '',
    debtTypes: [],
    behind: '',
    hardship: null,
    homeowner: null,
  });

  const state = useMemo(() => STATES.find((s) => s.slug === a.stateSlug), [a.stateSlug]);

  const results = useMemo(() => (showResults ? scoreOptions(a, state) : []), [showResults, a, state]);

  const canAdvance = () => {
    const id = STEPS[step].id;
    if (id === 'state') return a.stateSlug !== '';
    if (id === 'amount') return a.debtRange !== '';
    if (id === 'types') return a.debtTypes.length > 0;
    if (id === 'behind') return a.behind !== '';
    if (id === 'hardship') return a.hardship !== null;
    if (id === 'home') return a.homeowner !== null;
    return false;
  };

  const next = () => {
    if (step === STEPS.length - 1) setShowResults(true);
    else setStep((s) => s + 1);
  };

  const restart = () => {
    setShowResults(false);
    setStep(0);
    setA({ stateSlug: '', debtRange: '', debtTypes: [], behind: '', hardship: null, homeowner: null });
  };

  const toggleType = (t: string) =>
    setA((p) => ({
      ...p,
      debtTypes: p.debtTypes.includes(t) ? p.debtTypes.filter((x) => x !== t) : [...p.debtTypes, t],
    }));

  // ── Results panel ────────────────────────────────────────────────────
  if (showResults && state) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide mb-2">
            Your results — {state.name}
          </p>
          <h2 className="text-2xl font-black text-black dark:text-white mb-3">
            Options worth exploring, ranked for your situation
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
            These are educational matches based on typical program criteria — not a guarantee of
            acceptance or outcome. Ranked strongest first.
          </p>
        </div>

        <div className="space-y-4">
          {results.map((o, i) => {
            const fit = fitLabel(o.score);
            return (
              <div
                key={o.key}
                className={`rounded-2xl border-2 bg-white dark:bg-zinc-900 p-6 ${
                  i === 0
                    ? 'border-blue-500 dark:border-blue-400'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  {i === 0 && (
                    <span className="text-xs font-bold text-white bg-blue-600 rounded-full px-3 py-1">
                      TOP MATCH
                    </span>
                  )}
                  <span className={`text-xs font-semibold rounded-full border px-3 py-1 ${fit.cls}`}>
                    {fit.text}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-black dark:text-white mb-1">{o.name}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{o.tagline}</p>

                {o.whyFits.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-400 mb-1.5">
                      Why it may fit you
                    </p>
                    <ul className="space-y-1">
                      {o.whyFits.map((w) => (
                        <li key={w} className="text-sm text-zinc-700 dark:text-zinc-300 flex gap-2">
                          <span className="text-green-500 flex-shrink-0">✓</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {o.watchOut.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5">
                      Watch out
                    </p>
                    <ul className="space-y-1">
                      {o.watchOut.map((w) => (
                        <li key={w} className="text-sm text-zinc-700 dark:text-zinc-300 flex gap-2">
                          <span className="text-amber-500 flex-shrink-0">!</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link
                  href={o.learnHref}
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {o.learnLabel} →
                </Link>
              </div>
            );
          })}
        </div>

        {/* SOL note */}
        <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 p-5">
          <p className="text-blue-900 dark:text-blue-200 text-sm leading-relaxed">
            <strong>{state.name} timeline note:</strong> the commonly-cited statute of limitations
            on written contracts in {state.name} is about <strong>{state.solYears} years</strong>.
            Once expired, collectors can still ask for payment but generally can&apos;t win a lawsuit
            if you raise the defense. Limits vary by debt type — verify with your{' '}
            <a
              href="https://www.naag.org/find-my-ag/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              state attorney general
            </a>{' '}
            or a licensed attorney.{' '}
            <Link href={`/debt-relief/${state.slug}`} className="underline font-semibold">
              Full {state.name} guide →
            </Link>
          </p>
        </div>

        {a.behind === 'collections' && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-500 p-5">
            <p className="text-amber-900 dark:text-amber-200 text-sm leading-relaxed">
              <strong>If you&apos;ve been served with a lawsuit:</strong> respond by the deadline on
              the summons — ignoring it usually means an automatic judgment against you. Free legal
              aid may be available via{' '}
              <a
                href="https://www.lawhelp.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                LawHelp.org
              </a>
              , and many bankruptcy attorneys offer free first consultations.
            </p>
          </div>
        )}

        <EmailCapture state={state} />

        {/* CTAs */}
        <div className="rounded-2xl bg-blue-600 p-6 sm:p-8 text-white">
          <h3 className="text-xl font-bold mb-2">Want real numbers for your situation?</h3>
          <p className="text-blue-100 mb-5 text-sm leading-relaxed">
            The free 2-minute assessment compares provider options against your actual debts — free,
            no credit check, no obligation.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/assessment"
              className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Start the free assessment
            </Link>
            <Link
              href={`/debt-relief/${state.slug}`}
              className="inline-block rounded-xl border border-white/60 px-6 py-3 font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              {state.name} state guide
            </Link>
          </div>
        </div>

        {/* Free resources */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
          <h3 className="font-bold text-black dark:text-white mb-3">Free, trustworthy resources</h3>
          <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <li>
              <a href="https://www.nfcc.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                National Foundation for Credit Counseling
              </a>{' '}
              — nonprofit agencies offering free or low-cost counseling nationwide.
            </li>
            <li>
              <a href="https://www.consumerfinance.gov/complaint/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                CFPB complaint portal
              </a>{' '}
              — federal complaints about collectors, credit bureaus, and lenders.
            </li>
            <li>
              <a href="https://www.naag.org/find-my-ag/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                {state.name} Attorney General
              </a>{' '}
              — consumer protection and collector complaints.
            </li>
            <li>
              <a href="https://www.211.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                211
              </a>{' '}
              — local {state.name} assistance with rent, utilities, and food.
            </li>
          </ul>
        </div>

        <button
          onClick={restart}
          className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 underline"
        >
          ← Start over
        </button>
      </div>
    );
  }

  // ── Wizard steps ─────────────────────────────────────────────────────
  const stepId = STEPS[step].id;
  const progress = Math.round((step / STEPS.length) * 100);

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-4 h-0.5 mx-1 ${i < step ? 'bg-green-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-blue-600 dark:text-blue-400">{STEPS[step].label}</span>
          <span>{progress}% complete</span>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-100 dark:border-zinc-800 p-6 sm:p-8">
        {stepId === 'state' && (
          <div>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Which state do you live in?</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">
              Debt collection time limits and protections differ by state.
            </p>
            <select
              value={a.stateSlug}
              onChange={(e) => setA((p) => ({ ...p, stateSlug: e.target.value }))}
              className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-lg"
            >
              <option value="">Select your state…</option>
              {STATES.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {stepId === 'amount' && (
          <div>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
              How much unsecured debt do you owe?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">
              Credit cards, medical bills, personal loans — not mortgages or auto loans.
            </p>
            <div className="space-y-3">
              {DEBT_RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setA((p) => ({ ...p, debtRange: r.label }))}
                  className={`${OPTION_BTN} ${a.debtRange === r.label ? OPTION_ON : OPTION_OFF}`}
                >
                  {r.label}
                  {a.debtRange === r.label && <Check />}
                </button>
              ))}
            </div>
          </div>
        )}

        {stepId === 'types' && (
          <div>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-2">What kinds of debt?</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">Select all that apply.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEBT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => toggleType(t.value)}
                  className={`${OPTION_BTN} ${a.debtTypes.includes(t.value) ? OPTION_ON : OPTION_OFF}`}
                >
                  {t.label}
                  {a.debtTypes.includes(t.value) && <Check />}
                </button>
              ))}
            </div>
          </div>
        )}

        {stepId === 'behind' && (
          <div>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
              Where do you stand on payments?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">Honest answer — it changes which options fit.</p>
            <div className="space-y-3">
              {BEHIND_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setA((p) => ({ ...p, behind: o.value }))}
                  className={`${OPTION_BTN} ${a.behind === o.value ? OPTION_ON : OPTION_OFF}`}
                >
                  {o.label}
                  {a.behind === o.value && <Check />}
                </button>
              ))}
            </div>
          </div>
        )}

        {stepId === 'hardship' && (
          <div>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-2">
              Has a hardship made payments unaffordable?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">
              Job loss, medical event, divorce, reduced hours — anything that cut your income or spiked expenses.
            </p>
            <div className="space-y-3">
              {[
                { v: true, label: 'Yes — income dropped or an emergency hit' },
                { v: false, label: 'No — income is steady but debt is heavy' },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  onClick={() => setA((p) => ({ ...p, hardship: o.v }))}
                  className={`${OPTION_BTN} ${a.hardship === o.v ? OPTION_ON : OPTION_OFF}`}
                >
                  {o.label}
                  {a.hardship === o.v && <Check />}
                </button>
              ))}
            </div>
          </div>
        )}

        {stepId === 'home' && (
          <div>
            <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Do you own your home?</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">
              Home equity is treated differently under each state&apos;s exemption rules — this affects
              which paths protect it.
            </p>
            <div className="space-y-3">
              {[
                { v: false, label: 'No — I rent or stay with family' },
                { v: true, label: 'Yes — I own my home' },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  onClick={() => setA((p) => ({ ...p, homeowner: o.v }))}
                  className={`${OPTION_BTN} ${a.homeowner === o.v ? OPTION_ON : OPTION_OFF}`}
                >
                  {o.label}
                  {a.homeowner === o.v && <Check />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          <button
            onClick={next}
            disabled={!canAdvance()}
            className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === STEPS.length - 1 ? 'See my options →' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
