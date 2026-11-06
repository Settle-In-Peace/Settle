import type { Metadata } from 'next';
import Link from 'next/link';
import { API_URL } from '../../lib/apiUrl';
import ComplianceDisclosure from '../../components/ComplianceDisclosure';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Provider Marketplace | Settle In Peace',
  description:
    'Browse the Settle In Peace provider marketplace. Real partner providers appear here as they enroll — showcase profiles below preview the partners joining soon.',
  alternates: { canonical: '/marketplace' },
};

interface PublicProvider {
  id: string;
  companyName: string;
  description?: string;
  city?: string;
  statesServed?: string[];
  serviceTypes?: string[];
  avgRating?: number;
  reviewCount?: number;
  bbbRating?: string;
  isAfccMember?: boolean;
  isIapdaMember?: boolean;
  yearsInBusiness?: number;
  website?: string;
}

async function getActiveProviders(): Promise<PublicProvider[]> {
  try {
    const res = await fetch(`${API_URL}/providers`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data?.items ?? [];
  } catch {
    return [];
  }
}

/**
 * SHOWCASE demo profiles — honest placeholders, NOT real providers.
 * They preview the partner types joining the marketplace while real
 * enrollment ramps. Every card is badged "Showcase partner — coming soon"
 * and has no contact or purchase action.
 */
const SHOWCASE_PARTNERS: {
  name: string;
  hq: string;
  services: string[];
  states: string[];
  blurb: string;
  specialty?: string;
}[] = [
  {
    name: 'ClearPath Debt Relief',
    hq: 'Austin, TX',
    services: ['Debt settlement'],
    states: ['TX', 'AZ', 'NM', 'CO'],
    blurb: 'Settlement programs for $10K+ unsecured debt with a single monthly program deposit.',
    specialty: 'Credit card debt',
  },
  {
    name: 'Beacon Settlement Group',
    hq: 'Tampa, FL',
    services: ['Debt settlement', 'Credit counseling referral'],
    states: ['FL', 'GA', 'AL', 'SC'],
    blurb: 'Southeast-focused negotiators; free consultation before any enrollment.',
    specialty: 'Medical debt',
  },
  {
    name: 'Summit Financial Resolution',
    hq: 'Denver, CO',
    services: ['Debt consolidation'],
    states: ['CO', 'UT', 'WY', 'MT'],
    blurb: 'Consolidation-first approach — settlement only when consolidation can\u2019t work.',
  },
  {
    name: 'Harbor Point Advisors',
    hq: 'San Diego, CA',
    services: ['Debt settlement'],
    states: ['CA', 'NV', 'AZ'],
    blurb: 'Bilingual (EN/ES) enrollment teams for West Coast consumers.',
    specialty: 'Personal loans',
  },
  {
    name: 'Bluegrass Debt Solutions',
    hq: 'Louisville, KY',
    services: ['Debt settlement'],
    states: ['KY', 'TN', 'IN', 'OH'],
    blurb: 'Small-team settlement firm emphasizing quarterly progress reviews.',
  },
  {
    name: 'Cornerstone Relief Partners',
    hq: 'Columbus, OH',
    services: ['Debt consolidation', 'Credit repair'],
    states: ['OH', 'MI', 'PA', 'WV'],
    blurb: 'Pairs consolidation plans with credit-rebuild coaching.',
  },
  {
    name: 'Cascade Debt Negotiation',
    hq: 'Portland, OR',
    services: ['Debt settlement'],
    states: ['OR', 'WA', 'ID'],
    blurb: 'Pacific-Northwest negotiators; transparent fee schedule published up front.',
  },
  {
    name: 'Prairie State Resolution',
    hq: 'Kansas City, MO',
    services: ['Debt settlement'],
    states: ['MO', 'KS', 'NE', 'IA'],
    blurb: 'Midwest coverage with evening/weekend consultation hours.',
  },
  {
    name: 'Palmetto Debt Care',
    hq: 'Charleston, SC',
    services: ['Credit counseling'],
    states: ['SC', 'NC', 'GA'],
    blurb: 'Nonprofit-style counseling and DMP alternatives before settlement.',
  },
  {
    name: 'Lone Star Settlement Co.',
    hq: 'Dallas, TX',
    services: ['Debt settlement'],
    states: ['TX', 'OK', 'LA', 'AR'],
    blurb: 'High-volume settlement desk for $15K+ unsecured balances.',
    specialty: 'Collections accounts',
  },
  {
    name: 'Granite Relief Services',
    hq: 'Concord, NH',
    services: ['Debt consolidation'],
    states: ['NH', 'ME', 'VT', 'MA'],
    blurb: 'New-England consolidators with a no-jargon enrollment process.',
  },
  {
    name: 'Sierra Debt Advocacy',
    hq: 'Reno, NV',
    services: ['Debt settlement', 'Bankruptcy referral'],
    states: ['NV', 'CA', 'UT'],
    blurb: 'Routes consumers to settlement or attorney referral based on fit.',
    specialty: 'BK-vs-settlement triage',
  },
];

const SERVICE_LABEL: Record<string, string> = {
  debt_settlement: 'Debt settlement',
  debt_consolidation: 'Debt consolidation',
  credit_repair: 'Credit repair',
  bankruptcy: 'Bankruptcy',
  credit_counseling: 'Credit counseling',
};

export default async function MarketplacePage() {
  const providers = await getActiveProviders();

  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
        Provider Marketplace
      </p>
      <h1 className="mt-2 text-4xl font-bold text-slate-900">
        Debt relief partners
      </h1>
      <p className="mt-4 max-w-2xl text-slate-600">
        Settle In Peace is a marketplace — we connect consumers with independent
        debt-relief providers. Enrolled partners are listed below; contact
        always happens between you and the provider.
      </p>

      {/* Live partners */}
      {providers.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-slate-900">Enrolled partners</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{p.companyName}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {p.city || '—'} · {(p.statesServed ?? []).slice(0, 4).join(' ') || '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
                      Partner
                    </span>
                    {!!p.avgRating && (
                      <span className="text-sm font-semibold text-amber-600">
                        ★ {Number(p.avgRating).toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
                {p.description && (
                  <p className="mt-3 text-sm text-slate-600">{p.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(p.serviceTypes ?? []).map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600"
                    >
                      {SERVICE_LABEL[s] ?? s.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {p.isAfccMember && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">
                      AFCC member
                    </span>
                  )}
                  {p.isIapdaMember && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">
                      IAPDA certified
                    </span>
                  )}
                </div>
                <Link
                  href={`/compare`}
                  className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Check eligibility
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Showcase — honest demo profiles */}
      <section className="mt-12">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-lg font-bold text-amber-900">
            Showcase partners — coming soon
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            The marketplace is enrolling providers now. The profiles below are
            <span className="font-semibold"> demo listings</span> that preview
            the kinds of partners joining — they are not real companies yet and
            cannot be contacted or hired. Enrolled partners appear above as
            they go live.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SHOWCASE_PARTNERS.map((p) => (
            <div
              key={p.name}
              className="relative rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"
            >
              <span className="absolute right-4 top-4 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Showcase
              </span>
              <h3 className="pr-20 text-base font-semibold text-slate-800">{p.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{p.hq}</p>
              <p className="mt-2 text-sm text-slate-600">{p.blurb}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.services.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                States served: {p.states.join(' · ')}
                {p.specialty ? ` — ${p.specialty}` : ''}
              </p>
              <button
                disabled
                className="mt-4 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
              >
                Not yet available
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTAs */}
      <div className="mt-14 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-lg font-bold text-slate-900">Need debt relief now?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Take the free assessment — we score your situation and notify
            matched providers the moment partners in your state go live.
          </p>
          <Link
            href="/assessment"
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Start free assessment
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-900">Are you a provider?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Join the marketplace — get matched, ML-scored leads in the states
            you serve. No shared leads, no pay-per-impression.
          </p>
          <Link
            href="/providers"
            className="mt-4 inline-block rounded-lg border border-emerald-600 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Enroll as a provider
          </Link>
        </div>
      </div>

      <div className="mt-10">
        <ComplianceDisclosure />
      </div>
    </main>
  );
}
