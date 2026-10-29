'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ComplianceDisclosure from '../../components/ComplianceDisclosure';
import { PARTNER_OFFERS } from '../../config/partner-offers';
import { compareProviders, getProviders } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { API_URL } from '@/lib/apiUrl';

interface Provider {
  id: string;
  companyName: string;
  description?: string;
  logoUrl?: string;
  serviceTypes?: string[];
  debtTypes?: string[];
  statesServed?: string[];
  minDebtAmount: number;
  feePercentage?: number;
  bbbRating?: string;
  avgRating?: number;
  reviewCount: number;
  successfulSettlements: number;
  avgSettlementDays?: number;
  avgSavingsPercentage?: number;
  isAfccMember: boolean;
  isIapdaMember: boolean;
  yearsInBusiness?: number;
  website?: string;
  matchScore?: number;
  matchReasons?: string[];
}

const STARS = (rating?: number) => {
  if (!rating) return null;
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <span key={i} className={`text-sm ${i < full ? 'text-yellow-400' : (i === full && half) ? 'text-yellow-300' : 'text-zinc-300 dark:text-zinc-600'}`}>
          ★
        </span>
      ))}
    </span>
  );
};

const VETTING_CRITERIA = [
  {
    title: 'Upfront fee disclosure',
    description: 'Providers are asked to disclose setup costs, monthly fees, and success fees before you enroll.',
  },
  {
    title: 'AFCC / IAPDA membership',
    description: 'Provider profiles consider membership with the American Fair Credit Council and IAPDA certifications.',
  },
  {
    title: 'BBB & consumer ratings',
    description: 'Ratings, complaint history, and consumer reviews inform provider profiles.',
  },
  {
    title: 'State licensing',
    description: 'Providers are asked to confirm required licenses, registrations, and surety bonds.',
  },
  {
    title: 'Reported success metrics',
    description: 'Providers are asked to share average savings, settlement timelines, and completion rates.',
  },
  {
    title: 'No bait-and-switch',
    description: 'Marketing claims are reviewed against program terms and consumer outcomes.',
  },
];

const DEBT_OPTIONS = [
  { label: 'Under $7.5K', value: '5000' },
  { label: '$7.5K – $15K', value: '10000' },
  { label: '$15K – $25K', value: '20000' },
  { label: '$25K – $50K', value: '35000' },
  { label: '$50K – $100K', value: '75000' },
  { label: 'Over $100K', value: '125000' },
];

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center text-zinc-500">Loading...</div>}>
      <CompareContent />
    </Suspense>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get('leadId');
  const isMatched = !!leadId;

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'rating' | 'fee' | 'savings' | 'match'>('match');
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!sortBy) return;
    if (isMatched && sortBy === 'rating') setSortBy('match');
  }, [isMatched, sortBy]);

  useEffect(() => {
    const fetchProviders = async () => {
      setLoading(true);
      try {
        if (leadId) {
          const data = await compareProviders(leadId, getToken());
          setProviders(Array.isArray(data) ? (data as unknown as Provider[]) : []);
        } else {
          const data = await getProviders(getToken() ?? undefined);
          setProviders(Array.isArray(data) ? (data as unknown as Provider[]) : []);
        }
      } catch {
        setProviders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, [leadId]);

  const handleRequestContact = async (providerId: string) => {
    if (!leadId) return;
    setRequesting(providerId);
    setActionError('');
    try {
      const base = API_URL;
      const res = await fetch(`${base}/matching/request-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, providerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to request contact');
      }
      setRequestedIds((prev) => new Set(prev).add(providerId));
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong');
    } finally {
      setRequesting(null);
    }
  };

  const sorted = [...providers].sort((a, b) => {
    if (sortBy === 'match') return (b.matchScore || 0) - (a.matchScore || 0);
    if (sortBy === 'rating') return (b.avgRating || 0) - (a.avgRating || 0);
    if (sortBy === 'fee') return (a.feePercentage || 99) - (b.feePercentage || 99);
    if (sortBy === 'savings') return (b.avgSavingsPercentage || 0) - (a.avgSavingsPercentage || 0);
    return 0;
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide mb-2">
            {isMatched ? 'Personalized For You' : 'Side-by-Side Comparison'}
          </p>
          <h1 className="text-4xl font-bold text-black dark:text-white">
            {isMatched ? 'Providers Matched to Your Profile' : 'Compare Debt Relief Providers'}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-3 text-lg max-w-2xl mx-auto">
            {isMatched
              ? "Based on your assessment, here are the providers most likely to help your situation — ranked by match score."
              : 'Compare fees, ratings, and program details side by side — so you choose with confidence.'}
          </p>
        </div>

        {actionError && (
          <div className="mb-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300 text-sm">
            {actionError}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-20 text-zinc-500">Loading providers...</div>
        )}

        {/* Waitlist / empty state — providers not available yet */}
        {!loading && providers.length === 0 && (
          <div className="space-y-16">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 md:p-12 text-white text-center shadow-xl">
              <h2 className="text-3xl md:text-4xl font-black mb-4">Our provider network is being built</h2>
              <p className="text-blue-100 text-lg max-w-2xl mx-auto mb-8">
                We're onboarding qualified debt relief providers now. Take the free assessment to be first in line when side-by-side comparisons go live.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Link
                  href="/assessment"
                  className="px-8 py-4 bg-white text-blue-700 font-bold text-lg rounded-xl hover:bg-blue-50 transition-all shadow-lg"
                >
                  Take Free Assessment →
                </Link>
                <Link
                  href="/providers"
                  className="px-8 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white font-semibold text-lg rounded-xl hover:bg-white/20 transition-all"
                >
                  I'm a Provider — Join the Network
                </Link>
              </div>

              <div className="max-w-xl mx-auto bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                <p className="text-sm text-blue-100 mb-3">Want to see which providers fit your debt level?</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DEBT_OPTIONS.map((opt) => (
                    <Link
                      key={opt.value}
                      href={`/assessment?debt=${opt.value}`}
                      className="py-2.5 px-3 rounded-lg border-2 border-white/30 text-center text-sm font-medium text-white hover:bg-white/20 transition-all"
                    >
                      {opt.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Partner offers — affiliate links bridge the gap while the marketplace fills in */}
            <div>
              <div className="text-center mb-6">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide mb-2">Available now</p>
                <h2 className="text-3xl font-black text-black dark:text-white">Partner programs you can explore today</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl mx-auto text-sm">
                  Settle In Peace may earn a commission if you enroll through these links — at no cost to you. Offers are provided by third parties; eligibility and results vary.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {PARTNER_OFFERS.map((offer) => (
                  <div
                    key={offer.id}
                    className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-2">
                      {offer.tag}
                    </span>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">{offer.name}</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 flex-1">{offer.blurb}</p>
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="sponsored nofollow noopener"
                      className="mt-4 inline-flex justify-center items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      {offer.cta} →
                    </a>
                    {offer.providerLine && (
                      <p className="mt-4 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                        {offer.providerLine}
                      </p>
                    )}
                    {offer.disclaimer && (
                      <p className="mt-2 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
                        {offer.disclaimer}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* How we vet */}
            <div>
              <div className="text-center mb-8">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide mb-2">What makes us different</p>
                <h2 className="text-3xl font-black text-black dark:text-white">How providers are evaluated</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl mx-auto">
                  Provider profiles draw on fee disclosures, licensing, and reported results.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {VETTING_CRITERIA.map((criterion) => (
                  <div
                    key={criterion.title}
                    className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm"
                  >
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">{criterion.title}</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{criterion.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Two-sided CTA */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">For consumers</h3>
                <p className="text-zinc-500 dark:text-zinc-400 mb-4">
                  Join early access. We'll match you with providers as our network grows — no obligation, no credit check.
                </p>
                <Link
                  href="/assessment"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Get Started →
                </Link>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">For debt relief providers</h3>
                <p className="text-zinc-500 dark:text-zinc-400 mb-4">
                  Access intent-driven leads and get listed in an independent comparison marketplace.
                </p>
                <Link
                  href="/providers"
                  className="inline-flex items-center px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg transition-colors"
                >
                  Join the Network →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Provider cards — shown when providers exist */}
        {!loading && providers.length > 0 && (
          <>
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-8 text-center">
              <p className="text-blue-800 dark:text-blue-300 text-sm font-medium">
                💡 More providers are joining soon. Taking the assessment helps us match you with the best-fit options as the network grows.
              </p>
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <span className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">Sort by:</span>
              {([
                ...(isMatched ? [{ id: 'match' as const, label: 'Best Match' }] : []),
                { id: 'rating' as const, label: 'Highest Rated' },
                { id: 'fee' as const, label: 'Lowest Fee' },
                { id: 'savings' as const, label: 'Most Savings' },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    sortBy === opt.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              {sorted.map((p, index) => (
                <div
                  key={p.id}
                  className={`bg-white dark:bg-zinc-900 rounded-2xl shadow-md overflow-hidden border-2 ${
                    index === 0 && isMatched ? 'border-green-500' : index === 0 ? 'border-blue-500' : 'border-transparent'
                  }`}
                >
                  {index === 0 && (
                    <div className={`text-white text-center text-xs font-semibold py-1.5 tracking-wide ${isMatched ? 'bg-green-600' : 'bg-blue-600'}`}>
                      {isMatched ? `BEST MATCH — ${p.matchScore}% Match` : 'BEST MATCH — Highest Rated'}
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-6">
                      {/* Company info */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <h2 className="text-xl font-bold text-black dark:text-white">{p.companyName}</h2>
                              {isMatched && typeof p.matchScore === 'number' && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full bg-green-600">
                                  {p.matchScore}% Match
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {p.avgRating && (
                                <>
                                  {STARS(p.avgRating)}
                                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {p.avgRating} ({p.reviewCount?.toLocaleString()} reviews)
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          {p.bbbRating && (
                            <div className="text-center flex-shrink-0">
                              <div className="text-2xl font-black text-green-600">{p.bbbRating}</div>
                              <div className="text-xs text-zinc-500">BBB Rating</div>
                            </div>
                          )}
                        </div>

                        {p.description && (
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-3">{p.description}</p>
                        )}

                        {isMatched && p.matchReasons && p.matchReasons.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-4">
                            {p.matchReasons.map((reason, i) => (
                              <span key={i} className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full font-medium border border-green-200 dark:border-green-800">
                                ✓ {reason}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Key stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                          {p.feePercentage && (
                            <div>
                              <div className="text-xs text-zinc-500">Fee</div>
                              <div className="text-lg font-bold text-blue-600">{p.feePercentage}%</div>
                            </div>
                          )}
                          {p.avgSavingsPercentage && (
                            <div>
                              <div className="text-xs text-zinc-500">Avg. Savings</div>
                              <div className="text-lg font-bold text-green-600">{p.avgSavingsPercentage}%</div>
                            </div>
                          )}
                          {p.avgSettlementDays && (
                            <div>
                              <div className="text-xs text-zinc-500">Timeline</div>
                              <div className="text-lg font-bold text-zinc-700 dark:text-zinc-300">
                                {Math.round(p.avgSettlementDays / 30)} mo
                              </div>
                            </div>
                          )}
                          {p.yearsInBusiness && (
                            <div>
                              <div className="text-xs text-zinc-500">In Business</div>
                              <div className="text-lg font-bold text-zinc-700 dark:text-zinc-300">
                                {p.yearsInBusiness} yrs
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Certifications */}
                        <div className="flex flex-wrap gap-2 mt-4">
                          {p.isAfccMember && (
                            <span className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 px-2 py-1 rounded-full font-medium">
                              AFCC Member
                            </span>
                          )}
                          {p.isIapdaMember && (
                            <span className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full font-medium">
                              IAPDA Certified
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="md:w-48 flex flex-col gap-2">
                        <div className="text-center md:text-left">
                          <div className="text-xs text-zinc-500">Min. Debt</div>
                          <div className="text-lg font-bold text-black dark:text-white">
                            ${p.minDebtAmount.toLocaleString()}
                          </div>
                        </div>
                        {isMatched && (
                          <button
                            onClick={() => handleRequestContact(p.id)}
                            disabled={requesting === p.id || requestedIds.has(p.id)}
                            className={`block w-full py-2.5 px-4 text-center text-sm font-bold rounded-lg transition-all ${
                              requestedIds.has(p.id)
                                ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800'
                                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                            }`}
                          >
                            {requestedIds.has(p.id)
                              ? '✓ Contact Requested'
                              : requesting === p.id
                              ? 'Requesting...'
                              : 'Request Contact →'}
                          </button>
                        )}
                        {p.website && (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full py-2.5 px-4 border-2 border-blue-600 text-blue-600 dark:text-blue-400 text-center text-sm font-bold rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-all"
                          >
                            Visit Website →
                          </a>
                        )}
                        {!isMatched && (
                          <Link
                            href="/assessment"
                            className="block w-full py-2.5 px-4 border-2 border-blue-600 text-blue-600 dark:text-blue-400 text-center text-sm font-bold rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-all"
                          >
                            Check If I Qualify
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Compliance disclosures */}
        <div className="mt-12">
          <ComplianceDisclosure />
        </div>
      </div>
    </div>
  );
}
