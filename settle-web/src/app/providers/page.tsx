'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import ComplianceDisclosure from '../../components/ComplianceDisclosure';
import { signupAsProvider } from '@/lib/api';
import PasswordInput from '../../components/PasswordInput';

const HOW_IT_WORKS_STEPS = [
  {
    step: '1',
    title: 'Consumer finds Settle',
    desc: 'Through Google ads, organic search, and partnerships',
  },
  {
    step: '2',
    title: 'Takes AI assessment',
    desc: 'Our AI Debt Advisor collects debt details conversationally',
  },
  {
    step: '3',
    title: 'Gets ML-scored & matched',
    desc: 'Lead scored 0-100, matched to providers by state, debt type, amount',
  },
  {
    step: '4',
    title: 'Provider sees lead in portal',
    desc: 'View matched leads with match score, debt details, quality tier',
  },
  {
    step: '5',
    title: 'Provider purchases lead',
    desc: 'Buy exclusive leads with credits. $75-300 per lead based on debt amount',
  },
  {
    step: '6',
    title: 'Provider contacts consumer',
    desc: 'Get full contact info. Consumer is expecting your call',
  },
];

const PORTAL_FEATURES: { title: string; desc: string; icon: ReactNode }[] = [
  {
    title: 'Smart Lead Inbox',
    desc: 'See matched leads sorted by match score. Filter by debt amount, type, state, and quality tier.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5 0V6.75A2.25 2.25 0 0 1 5.25 4.5h13.5A2.25 2.25 0 0 1 21 6.75v6.75m-19.5 0V18A2.25 2.25 0 0 0 3.75 20.25h16.5A2.25 2.25 0 0 0 21.75 18v-4.5" />
      </svg>
    ),
  },
  {
    title: 'ML Quality Scoring',
    desc: 'Every lead scored 0-100 using historical conversion data. Premium leads cost more but convert 3x better.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125 9 7.5l4.5 4.5L21 5.25M21 5.25v5.25m0-5.25h-5.25" />
      </svg>
    ),
  },
  {
    title: 'Exclusive Leads',
    desc: 'No shared leads. No competition. Once you buy a lead, it\'s yours alone.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    title: 'Credit-Based Pricing',
    desc: 'Buy credits in bulk. Spend only on leads you want. Pause anytime, no minimums.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
      </svg>
    ),
  },
  {
    title: 'Performance Analytics',
    desc: 'Track purchase rate, conversion rate, and ROI per lead source in real-time.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C5.25 13.125 6 6.75 9 6.75s3.75 8.25 6 8.25 3.75-3.75 6-3.75M3.75 19.5h16.5a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 20.25 4.5H3.75A2.25 2.25 0 0 0 1.5 6.75v10.5A2.25 2.25 0 0 0 3.75 19.5Z" />
      </svg>
    ),
  },
  {
    title: 'API Access',
    desc: 'Enterprise plans get ping-post API integration for automated lead purchasing.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
      </svg>
    ),
  },
];

const PLANS = [
  {
    id: 'pay_per_lead',
    name: 'Pay Per Lead',
    price: 'From $75/lead',
    description: 'Buy only the leads you want. No minimums, pause anytime.',
    features: [
      'Pre-qualified consumer leads',
      'Leads scored by debt amount & urgency',
      'State and debt-type filtering',
      'Real-time lead delivery',
      'No monthly commitment',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    id: 'marketplace_seat',
    name: 'Marketplace Seat',
    price: '$199/month',
    description: 'Listed on the comparison page + priority lead access. 30-day free trial.',
    features: [
      'Everything in Pay Per Lead',
      'Company profile on /compare page',
      'Priority placement in consumer results',
      '20% discount on all lead purchases',
      'Logo and description in marketplace',
      'Dedicated account manager',
    ],
    cta: 'Apply for a Seat',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom pricing',
    description: 'High-volume API access, custom integrations, and white-glove service.',
    features: [
      'Everything in Marketplace Seat',
      'API / ping-post integration',
      'Custom lead volume agreements',
      'Exclusive geographic territories',
      'Co-branded landing pages',
      'Real-time bidding access',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export default function ProvidersPage() {
  const [formStep, setFormStep] = useState<'plans' | 'signup' | 'success'>('plans');
  const [selectedPlan, setSelectedPlan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    email: '',
    password: '',
    phone: '',
    state: '',
    services: '',
    website: '',
    description: '',
    minDebtAmount: '7500',
    feePercentage: '',
    yearsInBusiness: '',
    bbbRating: '',
    isAfccMember: false,
    isIapdaMember: false,
  });

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
    if (planId === 'enterprise') {
      window.open('mailto:partners@settleinpeace.com?subject=Enterprise Plan Inquiry', '_blank');
      return;
    }
    setFormStep('signup');
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Your name is required.';
    if (!form.companyName.trim()) errors.companyName = 'Company name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address.';
    if (form.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a phone number with at least 10 digits.';
    if (!form.state) errors.state = 'Select the state where you operate.';
    if (!form.services.trim()) errors.services = 'Describe the services you offer.';
    return errors;
  };

  const formIsValid = Object.keys(validateForm()).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    setError('');
    try {
      await signupAsProvider({
        ...form,
        serviceTypes: form.services.split(',').map(service => service.trim()).filter(Boolean),
        statesServed: [form.state],
        subscriptionType: selectedPlan,
        minDebtAmount: parseFloat(form.minDebtAmount),
        feePercentage: form.feePercentage ? parseFloat(form.feePercentage) : undefined,
        yearsInBusiness: form.yearsInBusiness ? parseInt(form.yearsInBusiness) : undefined,
      });
      setFormStep('success');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (formStep === 'success') {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-black dark:text-white mb-4">Application Received!</h1>
          <p className="text-zinc-600 dark:text-zinc-400 text-lg mb-6">
            Our team will review your application and reach out within 1–2 business days to activate your account.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Questions? Email us at <a href="mailto:partners@settleinpeace.com" className="text-blue-500 hover:underline">partners@settleinpeace.com</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">

        {formStep === 'plans' && (
          <>
            {/* Hero */}
            <div className="text-center mb-14">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide mb-3">For Debt Relief Companies</p>
              <h1 className="text-4xl md:text-5xl font-black text-black dark:text-white mb-4">
                Access the most qualified<br />debt relief leads in the market.
              </h1>
              <p className="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
                Our consumers self-qualify through a detailed 7-step assessment before you ever speak to them. Higher intent. Better conversions. Lower waste.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
              {[
                { value: '$22,000', label: 'Avg consumer debt' },
                { value: '68%', label: 'Qualify for settlement' },
                { value: '3.2x', label: 'Avg conversion vs cold leads' },
                { value: '100%', label: 'TCPA compliant' },
              ].map(stat => (
                <div key={stat.label} className="bg-white dark:bg-zinc-900 rounded-xl shadow p-5 text-center">
                  <div className="text-3xl font-black text-blue-600 dark:text-blue-400">{stat.value}</div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* How it works — visual flow */}
            <div className="mb-16">
              <h2 className="text-2xl font-bold text-black dark:text-white text-center mb-2">How it works</h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-center mb-10">From consumer search to closed deal in 6 steps</p>
              <div className="relative">
                {/* connecting line — horizontal on desktop */}
                <div className="hidden md:block absolute top-5 left-[8%] right-[8%] h-0.5 bg-zinc-200 dark:bg-zinc-700" />
                {/* connecting line — vertical on mobile */}
                <div className="md:hidden absolute left-5 top-5 bottom-5 w-0.5 bg-zinc-200 dark:bg-zinc-700" />
                <div className="grid grid-cols-1 md:grid-cols-6 gap-8 md:gap-4 relative">
                  {HOW_IT_WORKS_STEPS.map(item => (
                    <div key={item.step} className="flex items-start md:flex-col md:items-center gap-4 md:gap-0 relative">
                      <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0 z-10 ring-4 ring-zinc-50 dark:ring-black">
                        {item.step}
                      </div>
                      <div className="md:mt-3">
                        <h3 className="font-semibold text-black dark:text-white mb-1 text-sm md:text-base">{item.title}</h3>
                        <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Plans */}
            <h2 className="text-2xl font-bold text-black dark:text-white text-center mb-8">Choose your access plan</h2>
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              {PLANS.map(plan => (
                <div
                  key={plan.id}
                  className={`rounded-2xl p-7 flex flex-col ${
                    plan.highlighted
                      ? 'bg-blue-600 text-white shadow-xl scale-[1.02]'
                      : 'bg-white dark:bg-zinc-900 shadow-md'
                  }`}
                >
                  {plan.highlighted && (
                    <div className="text-xs font-bold uppercase tracking-widest text-blue-200 mb-3">Most Popular</div>
                  )}
                  <h3 className={`text-xl font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-black dark:text-white'}`}>
                    {plan.name}
                  </h3>
                  <div className={`text-2xl font-black mb-2 ${plan.highlighted ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                    {plan.price}
                  </div>
                  <p className={`text-sm mb-5 ${plan.highlighted ? 'text-blue-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    {plan.description}
                  </p>
                  <ul className="space-y-2 mb-8 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className={`flex gap-2 text-sm ${plan.highlighted ? 'text-blue-50' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        <span className={plan.highlighted ? 'text-blue-200' : 'text-green-500'}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`w-full py-3 rounded-xl font-bold transition-all ${
                      plan.highlighted
                        ? 'bg-white text-blue-600 hover:bg-blue-50'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              ))}
            </div>

            {/* Provider Portal Features */}
            <div className="mb-16">
              <h2 className="text-2xl font-bold text-black dark:text-white text-center mb-2">Everything you need to close more deals</h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-center mb-10">Powerful tools built into your provider portal</p>
              <div className="grid md:grid-cols-3 gap-6">
                {PORTAL_FEATURES.map(f => (
                  <div key={f.title} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-6">
                    <div className="w-11 h-11 bg-blue-50 dark:bg-blue-950 rounded-xl flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
                      {f.icon}
                    </div>
                    <h3 className="font-bold text-black dark:text-white mb-2">{f.title}</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Lead Sample Preview */}
            <div className="mb-16">
              <h2 className="text-2xl font-bold text-black dark:text-white text-center mb-2">See what a lead looks like</h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-center mb-10">Here's an example of what you'll see in your portal before purchasing</p>
              <div className="max-w-lg mx-auto bg-white dark:bg-zinc-900 rounded-2xl shadow-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
                {/* mock browser bar */}
                <div className="bg-zinc-100 dark:bg-zinc-800 px-5 py-3 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-700">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-400" />
                    <span className="w-3 h-3 rounded-full bg-yellow-400" />
                    <span className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">provider.settle.com/leads</span>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">Lead #SET-4821</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 font-semibold">New</span>
                  </div>

                  {/* score + quality */}
                  <div className="flex items-center gap-4 mb-5 p-4 bg-blue-50 dark:bg-blue-950 rounded-xl">
                    <div className="text-3xl font-black text-blue-600 dark:text-blue-400">92</div>
                    <div className="flex-1">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">Match Score / 100</div>
                      <div className="text-sm font-semibold text-black dark:text-white">Premium Quality</div>
                    </div>
                    <div className="w-16 h-16 relative">
                      <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                        <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth="3" strokeDasharray="92, 100" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* debt details */}
                  <div className="space-y-2 mb-5">
                    {[
                      { label: 'Debt Amount', value: '$34,500' },
                      { label: 'Debt Types', value: 'Credit Card, Medical' },
                      { label: 'State', value: 'Texas' },
                      { label: 'Months Behind', value: '3' },
                      { label: 'Employment', value: 'Employed' },
                      { label: 'Monthly Income', value: '$4,200' },
                      { label: 'Credit Score', value: 'Fair (580-669)' },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between text-sm py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400">{row.label}</span>
                        <span className="font-medium text-black dark:text-white">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* locked PII */}
                  <div className="space-y-2 mb-5">
                    {['Name', 'Phone', 'Email'].map(field => (
                      <div key={field} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400">{field}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-zinc-400 dark:text-zinc-600 select-none blur-[3px]">XXXXXXXXXXX</span>
                          <svg className="w-4 h-4 text-zinc-400 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                          </svg>
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* price + actions */}
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">Price</div>
                      <div className="text-lg font-black text-black dark:text-white">$200 <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">(2 credits)</span></div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Decline</button>
                      <button type="button" className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors">Purchase Lead</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-3">Provider requirements</h3>
              <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                <li>✓ Active state licensing for debt settlement or consolidation</li>
                <li>✓ BBB rating of B or above</li>
                <li>✓ AFCC or IAPDA membership preferred</li>
                <li>✓ No upfront fees charged to consumers</li>
                <li>✓ FTC Telemarketing Sales Rule compliant</li>
              </ul>
            </div>
          </>
        )}

        {/* Signup Form */}
        {formStep === 'signup' && (
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setFormStep('plans')}
              className="text-blue-600 dark:text-blue-400 text-sm mb-6 hover:underline"
            >
              ← Back to plans
            </button>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-8">
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Create your provider account</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
                Plan: <strong>{PLANS.find(p => p.id === selectedPlan)?.name}</strong> · Your account will be reviewed before activation (1–2 business days).
              </p>

              {error && (
                <div className="mb-5 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Your Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} aria-invalid={!!formErrors.name} className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                  {formErrors.name && <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Company Name *</label>
                  <input
                    type="text" required value={form.companyName}
                    onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                    aria-invalid={!!formErrors.companyName}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {formErrors.companyName && <p className="mt-1 text-sm text-red-600">{formErrors.companyName}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Business Email *</label>
                    <input
                      type="email" required value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      aria-invalid={!!formErrors.email}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {formErrors.email && <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Phone *</label>
                    <input
                      type="tel" required value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      aria-invalid={!!formErrors.phone}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {formErrors.phone && <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Password *</label>
                  <PasswordInput
                    required minLength={8} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Primary State *</label>
                    <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} aria-invalid={!!formErrors.state} className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="">Select state...</option>
                      {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(state => <option key={state} value={state}>{state}</option>)}
                    </select>
                    {formErrors.state && <p className="mt-1 text-sm text-red-600">{formErrors.state}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Website</label>
                    <input
                      type="url" value={form.website}
                      onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">BBB Rating</label>
                    <select
                      value={form.bbbRating}
                      onChange={e => setForm(f => ({ ...f, bbbRating: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Select...</option>
                      {['A+','A','A-','B+','B','B-'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Min Debt ($)</label>
                    <input
                      type="number" value={form.minDebtAmount}
                      onChange={e => setForm(f => ({ ...f, minDebtAmount: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fee % of Debt</label>
                    <input
                      type="number" step="0.1" value={form.feePercentage}
                      onChange={e => setForm(f => ({ ...f, feePercentage: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Years in Business</label>
                    <input
                      type="number" value={form.yearsInBusiness}
                      onChange={e => setForm(f => ({ ...f, yearsInBusiness: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Services *</label>
                  <input type="text" value={form.services} onChange={e => setForm(f => ({ ...f, services: e.target.value }))} aria-invalid={!!formErrors.services} placeholder="e.g. debt_settlement, debt_consolidation" className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                  {formErrors.services && <p className="mt-1 text-sm text-red-600">{formErrors.services}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Company Description</label>
                  <textarea
                    rows={3} value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-700 dark:text-zinc-300">
                    <input type="checkbox" checked={form.isAfccMember} onChange={e => setForm(f => ({ ...f, isAfccMember: e.target.checked }))} className="accent-blue-600" />
                    AFCC Member
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-700 dark:text-zinc-300">
                    <input type="checkbox" checked={form.isIapdaMember} onChange={e => setForm(f => ({ ...f, isIapdaMember: e.target.checked }))} className="accent-blue-600" />
                    IAPDA Member
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={submitting || !formIsValid}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Application →'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Compliance disclosures */}
        <div className="mt-12">
          <ComplianceDisclosure />
        </div>
      </div>
    </div>
  );
}