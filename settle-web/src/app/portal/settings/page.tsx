'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

export default function PortalSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    fetch(`${API_URL}/providers/${storedUser.sub || storedUser.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setProfile)
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API_URL}/providers/profile`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: profile.companyName,
          phone: profile.phone,
          website: profile.website,
          description: profile.description,
          feePercentage: profile.feePercentage,
          minDebtAmount: profile.minDebtAmount,
          isAcceptingLeads: profile.isAcceptingLeads,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/portal" className="text-blue-600 text-sm hover:underline">← Back to Portal</Link>
          <span className="text-sm text-zinc-500">{user?.email}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-black text-black dark:text-white mb-2">Provider Settings</h1>
        <p className="text-zinc-500 mb-8">Update your company profile and lead preferences.</p>

        {saved && (
          <div className="mb-6 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-green-700 dark:text-green-300 text-sm">
            ✓ Settings saved successfully
          </div>
        )}

        <form onSubmit={handleSave} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 space-y-6">
          <div>
            <h3 className="font-bold text-black dark:text-white mb-4">Company Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={profile.companyName || ''}
                  onChange={e => setProfile({ ...profile, companyName: e.target.value })}
                  className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={profile.phone || ''}
                    onChange={e => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Website</label>
                  <input
                    type="url"
                    value={profile.website || ''}
                    onChange={e => setProfile({ ...profile, website: e.target.value })}
                    className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Description</label>
                <textarea
                  value={profile.description || ''}
                  onChange={e => setProfile({ ...profile, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Tell consumers about your services..."
                />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
            <h3 className="font-bold text-black dark:text-white mb-4">Lead Preferences</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Minimum Debt Amount ($)</label>
                  <input
                    type="number"
                    value={profile.minDebtAmount || 7500}
                    onChange={e => setProfile({ ...profile, minDebtAmount: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Fee Percentage (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={profile.feePercentage || ''}
                    onChange={e => setProfile({ ...profile, feePercentage: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-xl dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.isAcceptingLeads ?? true}
                    onChange={e => setProfile({ ...profile, isAcceptingLeads: e.target.checked })}
                    className="w-5 h-5 accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Accepting new leads (pauses lead delivery when unchecked)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
