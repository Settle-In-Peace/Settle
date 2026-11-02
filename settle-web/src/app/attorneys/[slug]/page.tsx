import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { API_URL } from '../../../lib/apiUrl';

export const revalidate = 3600;

interface Attorney {
  id: string; slug: string; companyName: string; contactName?: string;
  city?: string; statesServed?: string[]; website?: string; phone?: string;
  description?: string; avgRating?: number; featuredTier?: string | null;
  barNumber?: string;
}

async function getAttorney(slug: string): Promise<Attorney | null> {
  try {
    const res = await fetch(`${API_URL}/providers/attorneys/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAttorney(slug);
  if (!a) return { title: 'Attorney | Settle In Peace' };
  return {
    title: `${a.companyName} — Bankruptcy Attorney${a.city ? ` in ${a.city}` : ''} | Settle In Peace`,
    description: a.description?.slice(0, 155) ?? `${a.companyName} — bankruptcy attorney listing.`,
  };
}

export default async function AttorneyProfilePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const a = await getAttorney(slug);
  if (!a) notFound();

  const tierLabel = a.featuredTier === 'exclusive' ? 'Sponsored' : a.featuredTier ? 'Featured' : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-14">
      <Link href="/attorneys" className="text-sm text-emerald-700 hover:underline">← Attorney directory</Link>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{a.companyName}</h1>
            {a.contactName && <p className="mt-1 text-lg text-slate-600">{a.contactName}</p>}
          </div>
          {tierLabel && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
              {tierLabel}
            </span>
          )}
        </div>
        <p className="mt-3 text-slate-600">
          {[a.city, (a.statesServed ?? []).join(', ')].filter(Boolean).join(' · ')}
        </p>
        {!!a.avgRating && <p className="mt-2 font-semibold text-amber-600">★ {Number(a.avgRating).toFixed(1)}</p>}
        {a.barNumber && <p className="mt-2 text-sm text-slate-500">Bar No. {a.barNumber}</p>}
        {a.description && <p className="mt-6 leading-relaxed text-slate-700">{a.description}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          {a.website && (
            <a href={a.website} target="_blank" rel="noopener noreferrer sponsored"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              Visit website
            </a>
          )}
          {a.phone && (
            <a href={`tel:${a.phone}`}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400">
              Call {a.phone}
            </a>
          )}
        </div>
      </div>
      <p className="mt-6 text-xs text-slate-500">
        Listings marked Featured or Sponsored are paid placements. Contact happens directly
        between you and the attorney — Settle In Peace is an advertising venue, not a referral service.
      </p>
    </main>
  );
}
