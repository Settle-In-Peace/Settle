'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  createSiCreditsCheckout,
  getSiCreditPacks,
  getSiCreditsBalance,
  SiCreditPack,
} from '@/lib/api';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';
import { trackBeginCheckout } from '@/lib/ads';

const creditUses = [
  'Collection SI propensity scoring per account',
  'SI-drafted FDCPA-safe settlement offer letters',
  'Next-best-action recommendations for agents',
  'Call-log and notes summarization into CRM activity',
  'SI compliance pass on notes, scripts, and letters',
];

function CreditsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [packs, setPacks] = useState<SiCreditPack[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshBalance = useCallback(async () => {
    try {
      const res = await getSiCreditsBalance();
      setBalance(res.balance);
    } catch {
      setBalance(null);
    }
  }, []);

  useEffect(() => {
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      setNotice('Payment received — SI credits land in your balance within a few seconds.');
    } else if (checkout === 'cancelled') {
      setError('Checkout cancelled — no charge was made.');
    }

    const token = getStoredToken();
    const storedUser = getStoredUser();
    setSignedIn(Boolean(token && storedUser));

    void (async () => {
      try {
        const data = await getSiCreditPacks();
        setPacks(data.packs);
      } catch {
        setError('Unable to load credit packs — please refresh.');
      } finally {
        setLoading(false);
      }
      if (token && storedUser) await refreshBalance();
    })();
  }, [params, refreshBalance]);

  // After a successful checkout the webhook grants asynchronously — poll a
  // few times so the balance updates without a manual refresh.
  useEffect(() => {
    if (params.get('checkout') !== 'success') return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      await refreshBalance();
      if (attempts >= 6) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [params, refreshBalance]);

  const buy = async (pack: SiCreditPack) => {
    if (!signedIn) {
      router.push('/login');
      return;
    }
    setBusyPack(pack.id);
    setError('');
    try {
      const session = await createSiCreditsCheckout(pack.id);
      if (!session.url) throw new Error('Checkout did not return a payment URL.');
      trackBeginCheckout({ method: 'stripe', pack: pack.id });
      window.location.href = session.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusyPack(null);
    }
  };

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <header className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
            SI Credits
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            Fuel for Settle intelligence.
          </h1>
          <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400">
            SI credits power premium intelligence calls across the platform.
            Pay once by card — credits are metered per SI call by the shared
            gateway.
          </p>
        </header>

        {error && (
          <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {notice}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Your balance</h2>
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-right dark:border-blue-900 dark:bg-blue-950">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-300">
                  SI credits
                </p>
                <p className="text-2xl font-black">
                  {signedIn ? (balance ?? '—') : 'sign in'}
                </p>
              </div>
            </div>

            <h3 className="mt-8 text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              What credits power
            </h3>
            <ul className="mt-3 space-y-3">
              {creditUses.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              Credits never expire on our side and are shared per account.
              Free features — the assessment, comparisons, provider directory —
              stay free; credits only buy the SI layer.
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold">Buy a pack</h2>
            {loading ? (
              <p className="text-sm text-zinc-500">Loading packs…</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                      {pack.name}
                    </p>
                    <p className="mt-1 text-3xl font-black">
                      {pack.credits.toLocaleString()}
                      <span className="ml-1 text-sm font-medium text-zinc-400">credits</span>
                    </p>
                    <p className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">
                      ${pack.priceUsd}
                    </p>
                    <button
                      onClick={() => buy(pack)}
                      disabled={busyPack !== null}
                      className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busyPack === pack.id ? 'Redirecting…' : 'Buy with card'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
              Secure checkout by Stripe. Credits are granted automatically when
              payment completes — you will return to this page.
            </p>
            {!signedIn && (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                <Link href="/login" className="text-blue-600 underline dark:text-blue-400">
                  Sign in
                </Link>{' '}
                to see your balance and buy credits.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white dark:bg-zinc-950" />}>
      <CreditsInner />
    </Suspense>
  );
}
