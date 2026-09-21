'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

const CREDIT_PACKAGES = [
  { credits: 500, price: 50, bonus: 0, label: 'Starter', popular: false },
  { credits: 1000, price: 90, bonus: 0, label: 'Professional', popular: true },
  { credits: 2500, price: 200, bonus: 0, label: 'Business', popular: false },
  { credits: 5000, price: 350, bonus: 0, label: 'Enterprise', popular: false },
];

export default function BillingPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const storedUser = getStoredUser();
    if (!token || !storedUser) {
      router.push('/login');
      return;
    }
    if (storedUser.role !== 'provider') {
      router.push('/dashboard');
      return;
    }
    setUser(storedUser);
    fetch(`${API_URL}/providers/portal/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const handlePurchase = async () => {
    if (selected === null) return;
    setProcessing(true);
    try {
      const token = getStoredToken();
      const pkg = CREDIT_PACKAGES[selected];
      const res = await fetch(`${API_URL}/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ credits: pkg.credits }),
      });
      const data = await res.json();
      if (data.url) {
        // Redirect to Stripe-hosted checkout
        window.location.href = data.url;
      } else {
        alert(data.message || 'Failed to start checkout. Please try again.');
        setProcessing(false);
      }
    } catch (err) {
      alert('Something went wrong. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/portal" className="text-blue-600 text-sm hover:underline">← Back to Portal</Link>
          <span className="text-sm text-zinc-500">{user?.email}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-black text-black dark:text-white mb-2">Billing & Credits</h1>
        <p className="text-zinc-500 mb-8">Purchase credits to buy leads. Each lead costs $75–$300 depending on quality.</p>

        {/* Current balance */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Current Balance</div>
              <div className="text-3xl font-black text-green-600">${stats?.creditBalance || 0}</div>
            </div>
            <div className="text-right text-sm text-zinc-500">
              <div>Approx. {Math.floor((stats?.creditBalance || 0) / 150)} leads available</div>
              <div className="text-xs mt-1">Based on avg lead price of $150</div>
            </div>
          </div>
        </div>

        {/* Credit packages */}
        <h2 className="text-xl font-bold text-black dark:text-white mb-4">Add Credits</h2>
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {CREDIT_PACKAGES.map((pkg, i) => (
            <button
              key={pkg.label}
              onClick={() => setSelected(i)}
              className={`text-left rounded-xl p-5 border-2 transition-all ${
                selected === i
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-400'
              }`}
            >
              {pkg.popular && (
                <div className="text-xs font-bold text-blue-600 mb-2">⭐ BEST VALUE</div>
              )}
              <div className="text-lg font-bold text-black dark:text-white mb-1">{pkg.label}</div>
              <div className="text-2xl font-black text-blue-600 mb-1">${pkg.price}</div>
              <div className="text-sm text-zinc-500">{pkg.credits.toLocaleString()} credits</div>
              {pkg.bonus > 0 && (
                <div className="text-xs text-green-600 font-semibold mt-1">+ {pkg.bonus} bonus credits</div>
              )}
            </button>
          ))}
        </div>

        {selected !== null && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 mb-8">
            <h3 className="font-bold text-black dark:text-white mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><span className="text-zinc-500">Package:</span><span className="font-bold">{CREDIT_PACKAGES[selected].label}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Credits:</span><span className="font-bold">{CREDIT_PACKAGES[selected].credits.toLocaleString()}</span></div>
              {CREDIT_PACKAGES[selected].bonus > 0 && (
                <div className="flex justify-between"><span className="text-zinc-500">Bonus credits:</span><span className="font-bold text-green-600">+{CREDIT_PACKAGES[selected].bonus}</span></div>
              )}
              <div className="flex justify-between"><span className="text-zinc-500">Total credits:</span><span className="font-bold">{(CREDIT_PACKAGES[selected].credits + CREDIT_PACKAGES[selected].bonus).toLocaleString()}</span></div>
              <div className="flex justify-between text-lg pt-2 border-t border-zinc-200 dark:border-zinc-700"><span className="font-bold">Total:</span><span className="font-bold text-blue-600">${CREDIT_PACKAGES[selected].price}</span></div>
            </div>
            <button
              onClick={handlePurchase}
              disabled={processing}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40"
            >
              {processing ? 'Processing...' : 'Purchase Credits →'}
            </button>
            <p className="text-xs text-zinc-400 mt-3 text-center">Secure payment powered by Stripe</p>
          </div>
        )}

        {/* Billing history placeholder */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6">
          <h3 className="font-bold text-black dark:text-white mb-4">Billing History</h3>
          <p className="text-sm text-zinc-500">No transactions yet. Your billing history will appear here once you make a purchase.</p>
        </div>
      </div>
    </div>
  );
}
