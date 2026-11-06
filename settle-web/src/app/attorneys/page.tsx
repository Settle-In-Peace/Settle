import type { Metadata } from 'next';
import Link from 'next/link';
import { API_URL } from '../../lib/apiUrl';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Bankruptcy Attorneys Directory | Settle In Peace',
  description:
    'Find bankruptcy attorneys by state and city. Free and featured listings — paid placements are clearly marked Sponsored.',
  alternates: { canonical: '/attorneys' },
};

interface Attorney {
  id: string;
  slug: string;
  companyName: string;
  contactName?: string;
  city?: string;
  statesServed?: string[];
  website?: string;
  avgRating?: number;
  featuredTier?: 'founding' | 'featured' | 'exclusive' | null;
}

const TIER_LABEL: Record<string, string> = {
  exclusive: 'Sponsored',
  featured: 'Featured',
  founding: 'Featured',
};

async function getDirectory(state?: string, city?: string): Promise<Attorney[]> {
  const params = new URLSearchParams({ type: 'attorney' });
  if (state) params.set('state', state);
  if (city) params.set('city', city);
  try {
    const res = await fetch(`${API_URL}/providers/directory?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.items ?? [];
  } catch {
    return [];
  }
}

export default async function AttorneysPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; city?: string }>;
}) {
  const { state, city } = await searchParams;
  const items = await getDirectory(state?.toUpperCase(), city);

  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Attorney Directory</p>
      <h1 className="mt-2 text-4xl font-bold text-slate-900">Bankruptcy attorneys</h1>
      <p className="mt-4 max-w-2xl text-slate-600">
        If a debt-settlement program isn&apos;t the right fit, a bankruptcy attorney may be.
        Contact happens directly between you and the attorney — listings marked
        <span className="font-semibold"> Featured </span> or
        <span className="font-semibold"> Sponsored </span> are paid placements; all other
        attorneys are listed free.
      </p>

      <form className="mt-8 flex flex-wrap items-center gap-3" method="get">
        <input
          name="state"
          defaultValue={state}
          maxLength={2}
          placeholder="State (e.g. CA)"
          className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
        />
        <input
          name="city"
          defaultValue={city}
          placeholder="City"
          className="flex-1 min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          Search
        </button>
        {(state || city) && (
          <Link href="/attorneys" className="text-sm text-slate-500 underline">Clear</Link>
        )}
      </form>

      <div className="mt-10 space-y-4">
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No attorneys listed here yet{(state || city) ? ' — try widening your search.' : '.'}
          </p>
        )}
        {items.map((a) => (
          <Link
            key={a.id}
            href={`/attorneys/${a.slug}`}
            className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{a.companyName}</h2>
                {a.contactName && <p className="text-sm text-slate-600">{a.contactName}</p>}
                <p className="mt-1 text-sm text-slate-500">
                  {[a.city, (a.statesServed ?? []).slice(0, 3).join(' ')].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {a.featuredTier && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
                    {TIER_LABEL[a.featuredTier] ?? 'Featured'}
                  </span>
                )}
                {!!a.avgRating && (
                  <span className="text-sm font-semibold text-amber-600">★ {Number(a.avgRating).toFixed(1)}</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-bold text-slate-900">Are you a bankruptcy attorney?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Basic listings are free and claimable. Featured placement is flat-rate advertising —
          we never charge per lead, per client, or a percentage of your revenue.
        </p>
        <Link
          href="/attorneys/claim"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Claim or create your listing
        </Link>
      </div>
    </main>
  );
}
