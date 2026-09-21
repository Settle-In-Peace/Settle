'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createJsonApiClient } from '@settle/shared-sdk/auth';
import { storeAuth, isAuthenticated, clearAuth, getStoredUser } from '../../../lib/authUtils';
import LoadingSpinner from '../../../components/LoadingSpinner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

const STAFF_ROLES = ['admin', 'sales', 'provider', 'lender', 'referral_manager'];

const ROLE_DASHBOARDS: Record<string, string> = {
  admin: '/admin',
  sales: '/sales',
  provider: '/portal',
  lender: '/crm',
  referral_manager: '/crm',
};

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && isAuthenticated()) {
      const user = getStoredUser() || {};
      const dest = ROLE_DASHBOARDS[user?.role] || '/dashboard';
      router.replace(dest);
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  if (checkingAuth) {
    return <LoadingSpinner />;
  }

  const apiCall = createJsonApiClient({
    getBaseUrl: () => API_URL,
    getToken: () => null,
    onUnauthorized: () => {
      clearAuth();
      router.push('/staff/login');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiCall<{
        success: boolean;
        accessToken?: string;
        refreshToken?: string;
        user?: any;
        error?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.success && response.accessToken) {
        const role = response.user?.role;
        if (!STAFF_ROLES.includes(role)) {
          setError('This login is for staff members only. Use the customer login for consumer access.');
          setLoading(false);
          return;
        }
        storeAuth(response.accessToken, response.user, response.refreshToken);
        router.push(ROLE_DASHBOARDS[role] || '/dashboard');
      } else {
        setError(response.error || 'Login failed');
      }
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f7f5]">
      {/* Header — inspired by Americor's clean header with logo + contact */}
      <header className="py-5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Settle<span className="text-blue-400">InPeace</span>
          </Link>
          <a
            href="mailto:help@settleinpeace.com"
            className="flex items-center gap-2 border-[1.5px] border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-full text-sm font-bold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline">Staff Support</span>
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 mb-4">
                <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Staff Login</h1>
              <p className="text-sm text-slate-500 mt-1">For team members, providers, and partners</p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@settleinpeace.com"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Sign In
              </button>
            </form>

            <div className="mt-6 space-y-2 text-center text-sm text-slate-500">
              <p>
                Not a staff member?{' '}
                <Link href="/login" className="text-blue-600 hover:underline font-medium">Customer Login</Link>
              </p>
              <p>
                <Link href="/" className="text-slate-400 hover:text-slate-600">← Back to website</Link>
              </p>
            </div>

            {/* Role badges */}
            <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-5 gap-1 text-center">
              <div title="Admin Panel">
                <div className="text-xs font-bold text-slate-700">⚙️</div>
                <div className="text-[10px] text-slate-500 mt-1">Admin</div>
              </div>
              <div title="Sales CRM">
                <div className="text-xs font-bold text-slate-700">📊</div>
                <div className="text-[10px] text-slate-500 mt-1">Sales</div>
              </div>
              <div title="Provider Portal">
                <div className="text-xs font-bold text-slate-700">🏥</div>
                <div className="text-[10px] text-slate-500 mt-1">Provider</div>
              </div>
              <div title="Lender CRM">
                <div className="text-xs font-bold text-slate-700">🏦</div>
                <div className="text-[10px] text-slate-500 mt-1">Lender</div>
              </div>
              <div title="Referral Manager">
                <div className="text-xs font-bold text-slate-700">🔗</div>
                <div className="text-[10px] text-slate-500 mt-1">Referrals</div>
              </div>
            </div>
          </div>

          {/* Trust signals — inspired by Americor's TrustPilot/BBB badges */}
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.5A2.5 2.5 0 014.665 2H15.334a2.5 2.5 0 012.5 2.5v11.398a2.5 2.5 0 01-3.536 2.286l-2.286-1.143a2.5 2.5 0 00-2.236 0l-2.286 1.143A2.5 2.5 0 014.166 15.898V4.5zm4.666 2.5a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              <span>Secure Login</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <span>256-bit Encrypted</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <span>SSO Ready</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer — minimal, like Americor's clean footer */}
      <footer className="py-4 px-4 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto">
          © {new Date().getFullYear()} Settle In Peace, Inc. ·{' '}
          <Link href="/privacy" className="hover:text-slate-600">Privacy</Link> ·{' '}
          <Link href="/terms" className="hover:text-slate-600">Terms</Link> ·{' '}
          <Link href="/login" className="hover:text-slate-600">Customer Login</Link>
        </div>
      </footer>
    </div>
  );
}
