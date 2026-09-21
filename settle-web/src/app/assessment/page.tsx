'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ComplianceDisclosure from '../../components/ComplianceDisclosure';
import { submitAssessment } from '@/lib/api';

const STEPS = [
  { id: 'debt_amount', label: 'Debt Amount', icon: '$' },
  { id: 'debt_details', label: 'Your Debt', icon: 'CC' },
  { id: 'finances', label: 'Finances', icon: 'W' },
  { id: 'contact', label: 'Contact & Consent', icon: '@' },
];

const DEBT_TYPE_OPTIONS = [
  { value: 'credit_card', label: 'Credit Cards', icon: '💳' },
  { value: 'medical', label: 'Medical Bills', icon: '🏥' },
  { value: 'personal_loan', label: 'Personal Loans', icon: '🏦' },
  { value: 'student_loan', label: 'Student Loans', icon: '🎓' },
  { value: 'business', label: 'Business Debt', icon: '💼' },
  { value: 'other', label: 'Other', icon: '📋' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

// Exact TCPA disclosure text shown next to the consent checkbox. This is
// sent to the backend and stored on the lead record so there is a verifiable
// audit trail of what the consumer agreed to. If this text changes, bump the
// page version so historical consent records remain attributable.
const TCPA_CONSENT_LANGUAGE =
  'I agree to be contacted by Settle In Peace and its partner debt relief providers by phone, email, or text message regarding my debt situation. I understand this constitutes a TCPA-compliant opt-in and that standard message and data rates may apply. I may opt out at any time.';
const CONSENT_PAGE_VERSION = 'assessment-v1';

export default function AssessmentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    totalDebt: '',
    debtTypes: [] as string[],
    monthsBehind: '',
    employmentStatus: '',
    monthlyIncome: '',
    creditScore: '',
    hasFiledBankruptcy: false,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    state: '',
    zipCode: '',
    tcpaConsent: false,
  });

  const currentStep = STEPS[step];
  const progress = Math.round(((step) / STEPS.length) * 100);
  const timeLeft = Math.max(15, 60 - (step * 15));

  const toggleDebtType = (type: string) => {
    setForm(f => ({
      ...f,
      debtTypes: f.debtTypes.includes(type)
        ? f.debtTypes.filter(t => t !== type)
        : [...f.debtTypes, type],
    }));
  };

  const goNext = () => {
    setDirection(1);
    setStep(s => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep(s => s - 1);
  };

  const canAdvance = () => {
    if (currentStep.id === 'debt_amount') return Number(form.totalDebt) >= 1000;
    if (currentStep.id === 'debt_details') return form.debtTypes.length > 0 && form.monthsBehind !== '';
    if (currentStep.id === 'finances') return form.employmentStatus !== '' && form.monthlyIncome !== '';
    if (currentStep.id === 'contact')
      return form.firstName && form.lastName && form.email && form.phone && form.state && form.tcpaConsent;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await submitAssessment({
        ...form,
        totalDebt: parseFloat(form.totalDebt),
        monthsBehind: parseInt(form.monthsBehind) || 0,
        monthlyIncome: parseFloat(form.monthlyIncome) || 0,
        tcpaConsent: form.tcpaConsent,
        consentLanguage: TCPA_CONSENT_LANGUAGE,
        consentPageVersion: CONSENT_PAGE_VERSION,
      });
      const returnedLeadId = String(response.id ?? (response.lead as { id?: string } | undefined)?.id ?? '');
      if (!returnedLeadId) throw new Error('Assessment was submitted but no lead ID was returned.');
      localStorage.setItem('last_assessment_lead_id', returnedLeadId);
      setLeadId(returnedLeadId);
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-zinc-900 dark:to-black flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-black dark:text-white mb-4">You&apos;re on your way to peace.</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 text-lg">
            We&apos;ve matched your profile with qualified debt relief providers. Check your options now.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => leadId && router.push(`/compare?leadId=${encodeURIComponent(leadId)}`)}
              className="block w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 text-lg"
            >
              See Your Provider Matches →
            </button>
            <button
              onClick={() => router.push('/register')}
              className="block w-full py-3 px-6 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Create an account to track your progress
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-zinc-900 dark:to-black">
      {/* Compliance disclaimer banner */}
      <div className="bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700 text-center px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">
        Settle In Peace is a marketplace, not a debt settlement provider. By submitting this assessment, you consent to be contacted by partner providers. <span className="text-zinc-500 dark:text-zinc-500">See our <a href="/terms" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">Terms</a> &amp; <a href="/privacy" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">Privacy Policy</a>.</span>
      </div>

      {/* Top bar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-black dark:text-white">
              Settle<span className="text-blue-600">InPeace</span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              256-bit SSL Secure
            </span>
            <span>⏱ ~{timeLeft}s remaining</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide mb-2">Free Debt Assessment</p>
          <h1 className="text-3xl font-bold text-black dark:text-white">Find your path to financial peace</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2">1 minute · No credit check · No obligation</p>
          <Link
            href="/assessment/chat"
            className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Prefer to chat? Talk to our AI Debt Advisor →
          </Link>
        </div>

        {/* Step indicator dots */}
        <div className="mb-8">
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
                  <div className={`w-6 h-0.5 mx-1 ${i < step ? 'bg-green-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-blue-600 dark:text-blue-400">{currentStep.label}</span>
            <span>{progress}% complete</span>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-100 dark:border-zinc-800 p-8">

          {/* Step 1: Debt Amount */}
          {currentStep.id === 'debt_amount' && (
            <div>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">How much do you owe in total?</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">Include all unsecured debts combined — credit cards, medical bills, personal loans, etc.</p>
              <div className="space-y-3">
                {[
                  { label: 'Under $7,500', value: '5000', note: 'May qualify for coaching tools' },
                  { label: '$7,500 – $15,000', value: '10000', note: 'Qualifies for most programs' },
                  { label: '$15,000 – $25,000', value: '20000', note: 'Best savings potential' },
                  { label: '$25,000 – $50,000', value: '35000', note: 'Best savings potential' },
                  { label: '$50,000 – $100,000', value: '75000', note: 'Highest savings potential' },
                  { label: 'Over $100,000', value: '125000', note: 'Highest savings potential' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setForm(f => ({ ...f, totalDebt: opt.value }));
                      goNext();
                    }}
                    className={`w-full py-4 px-5 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                      form.totalDebt === opt.value
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-400'
                    }`}
                  >
                    <div>
                      <div className={`font-bold text-lg ${form.totalDebt === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-black dark:text-white'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">{opt.note}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${form.totalDebt === opt.value ? 'border-blue-600 bg-blue-600' : 'border-zinc-300'}`}>
                      {form.totalDebt === opt.value && (
                        <svg className="w-3 h-3 text-white mx-auto mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Debt Details */}
          {currentStep.id === 'debt_details' && (
            <div>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Tell us about your debt</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">Select all that apply.</p>
              <div className="grid grid-cols-2 gap-3">
                {DEBT_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => toggleDebtType(opt.value)}
                    className={`py-4 px-4 rounded-xl border-2 text-center transition-all ${
                      form.debtTypes.includes(opt.value)
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-400'
                    }`}
                  >
                    <div className="text-2xl mb-1">{opt.icon}</div>
                    <div className={`text-sm font-semibold ${form.debtTypes.includes(opt.value) ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {opt.label}
                    </div>
                  </button>
                ))}
              </div>
              <h3 className="text-lg font-bold text-black dark:text-white mt-8 mb-3">How far behind are you on payments?</h3>
              <div className="space-y-3">
                {[
                  { label: "I'm current on all payments", value: '0' },
                  { label: '1–2 months behind', value: '1' },
                  { label: '3–5 months behind', value: '3' },
                  { label: '6+ months behind', value: '6' },
                  { label: 'In collections', value: '12' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, monthsBehind: opt.value }))}
                    className={`w-full py-4 px-5 rounded-xl border-2 text-left font-medium transition-all flex items-center justify-between ${
                      form.monthsBehind === opt.value
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-400'
                    }`}
                  >
                    {opt.label}
                    {form.monthsBehind === opt.value && (
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Finances */}
          {currentStep.id === 'finances' && (
            <div>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Your finances</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">This helps match you with programs you qualify for. Stays private.</p>
              <h3 className="text-lg font-bold text-black dark:text-white mb-3">Employment status</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Employed full-time', value: 'employed', icon: '💼' },
                  { label: 'Self-employed / Freelance', value: 'self_employed', icon: '🧑‍💻' },
                  { label: 'Part-time / Gig work', value: 'part_time', icon: '🚗' },
                  { label: 'Unemployed', value: 'unemployed', icon: '🔍' },
                  { label: 'Retired', value: 'retired', icon: '🏖️' },
                  { label: 'Disability / Other', value: 'other', icon: '🩺' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, employmentStatus: opt.value }))}
                    className={`py-3 px-4 rounded-xl border-2 text-left font-medium transition-all flex items-center gap-3 ${
                      form.employmentStatus === opt.value
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-400'
                    }`}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              <h3 className="text-lg font-bold text-black dark:text-white mt-8 mb-3">Monthly income <span className="text-sm font-normal text-zinc-400">(before taxes)</span></h3>
              <div className="space-y-3">
                {[
                  { label: 'Under $2,000/month', value: '1500' },
                  { label: '$2,000 – $3,500/month', value: '2750' },
                  { label: '$3,500 – $5,000/month', value: '4250' },
                  { label: '$5,000 – $8,000/month', value: '6500' },
                  { label: 'Over $8,000/month', value: '10000' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, monthlyIncome: opt.value }))}
                    className={`w-full py-4 px-5 rounded-xl border-2 text-left font-medium transition-all ${
                      form.monthlyIncome === opt.value
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Contact & Consent */}
          {currentStep.id === 'contact' && (
            <div>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Where should we send your matches?</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">Your information is private, secure, and never sold to third parties.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">First Name</label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Last Name</label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">State</label>
                    <select
                      value={form.state}
                      onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                      className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    >
                      <option value="">Select state</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">ZIP Code</label>
                    <input
                      type="text"
                      value={form.zipCode}
                      onChange={e => setForm(f => ({ ...f, zipCode: e.target.value }))}
                      maxLength={5}
                      className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      placeholder="12345"
                    />
                  </div>
                </div>

                {/* Consent checkbox */}
                <label className="flex gap-3 cursor-pointer items-start pt-2">
                  <input
                    type="checkbox"
                    checked={form.tcpaConsent}
                    onChange={e => setForm(f => ({ ...f, tcpaConsent: e.target.checked }))}
                    className="mt-1 w-5 h-5 accent-blue-600 flex-shrink-0"
                  />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {TCPA_CONSENT_LANGUAGE}
                  </span>
                </label>
                {error && (
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex gap-3">
            {step > 0 && (
              <button
                onClick={goBack}
                className="px-6 py-3 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
              >
                ← Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                onClick={goNext}
                disabled={!canAdvance()}
                className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canAdvance() || submitting}
                className="flex-1 py-3 px-6 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Submitting...' : 'See My Options →'}
              </button>
            )}
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-zinc-400 dark:text-zinc-600">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            256-bit SSL Encrypted
          </span>
          <span>✓ No Credit Check</span>
          <span>✓ No Obligation</span>
          <span>✓ 100% Free</span>
          <span>✓ Confidential</span>
        </div>
      </div>

      {/* Compliance disclosures */}
      <div className="max-w-2xl mx-auto px-4 pb-12">
        <ComplianceDisclosure />
      </div>
    </div>
  );
}
