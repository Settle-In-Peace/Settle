'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '../../../lib/apiUrl';

const TIERS = [
  { id: 'founding', name: 'Founding Featured', price: 75, note: 'first 5 per state, locked 12 mo' },
  { id: 'featured', name: 'Featured', price: 149, note: 'sponsored badge + top-of-state ordering' },
  { id: 'exclusive', name: 'City Exclusive', price: 299, note: 'only featured listing in your city' },
];

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('sip_user') || localStorage.getItem('auth_token');
    if (!raw) return null;
    try { return JSON.parse(raw)?.token ?? raw; } catch { return raw; }
  } catch { return null; }
}

export default function PortalListingPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push('/login'); return; }
    fetch(`${API_URL}/providers/portal/listing-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => (r.ok ? setStats(await r.json()) : setError('Could not load listing stats')))
      .catch(() => setError('Could not load listing stats'))
      .finally(() => setLoading(false));
  }, [router]);

  async function upgrade(tierId: string) {
    const token = getToken();
    if (!token || upgrading) return;
    setUpgrading(tierId);
    setError('');
    try {
      const res = await fetch(`${API_URL}/stripe/directory-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tierId }),
      });
      const data = await res.json();
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.message || 'Checkout failed — try again');
    } catch {
      setError('Checkout failed — try again');
    } finally {
      setUpgrading('');
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/portal" className="text-sm text-emerald-700 hover:underline">← Portal</Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">Directory listing</h1>
      <p className="mt-2 text-slate-600">
        Your public attorney-directory listing — performance and flat-rate placement options.
        Paid placement is advertising only; we never charge per lead or per client.
      </p>

      {loading ? (
        <p className="mt-10 text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Listing', value: stats?.listingActive ? 'Live' : 'Off' },
              { label: 'Tier', value: stats?.featuredTier ?? 'Free' },
              { label: 'Views', value: stats?.views ?? 0 },
              { label: 'Clicks', value: stats?.clicks ?? 0 },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-xl font-bold text-slate-900 capitalize">{String(m.value)}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500">{m.label}</p>
              </div>
            ))}
          </div>
          {stats?.slug && (
            <p className="mt-4 text-sm text-slate-600">
              Public page: <Link className="text-emerald-700 underline" href={`/attorneys/${stats.slug}`}>/attorneys/{stats.slug}</Link>
            </p>
          )}
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <h2 className="mt-10 text-xl font-bold text-slate-900">Placement</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {TIERS.map((t) => {
              const current = stats?.featuredTier === t.id;
              return (
                <div key={t.id} className={`rounded-2xl border p-5 ${current ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                  <p className="font-bold text-slate-900">{t.name}</p>
                  <p className="mt-1 text-2xl font-extrabold text-emerald-700">${t.price}<span className="text-sm font-normal text-slate-500">/mo</span></p>
                  <p className="mt-2 text-xs text-slate-500">{t.note}</p>
                  {current ? (
                    <p className="mt-4 text-sm font-semibold text-emerald-700">Current plan</p>
                  ) : (
                    <button
                      onClick={() => upgrade(t.id)}
                      disabled={!!upgrading}
                      className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {upgrading === t.id ? 'Opening checkout…' : 'Upgrade'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Listings marked Featured or Sponsored are paid placements, labeled publicly.
            Cancel anytime from billing — placement stays active through the paid period.
          </p>
        </>
      )}
    </main>
  );
}
