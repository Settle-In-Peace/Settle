'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { startAuthentication } from '@simplewebauthn/browser';
import { createJsonApiClient } from '@settle/shared-sdk/auth';
import { storeAuth, isAuthenticated, clearAuth } from '../../lib/authUtils';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';

type AuthMode = 'password' | 'otp' | 'passkey';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && isAuthenticated()) {
      router.replace('/dashboard');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  // Prefill email/mode from query string (e.g. after registration)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('mode');
    const e = params.get('email');
    const sent = params.get('sent');
    const devCode = params.get('devCode');
    if (e) setEmail(e);
    if (m === 'otp') {
      setMode('otp');
      if (sent === '1') {
        setOtpSent(true);
        setInfo(devCode
          ? `Dev mode — your code is: ${devCode}`
          : 'Check your email for a 6-digit verification code.'
        );
      }
    }
  }, []);

  if (checkingAuth) {
    return <LoadingSpinner />;
  }

  const apiCall = createJsonApiClient({
    getBaseUrl: () => API_URL,
    getToken: () => null,
    onUnauthorized: () => {
      clearAuth();
      router.push('/login');
    },
  });

  const redirectByRole = (role?: string) => {
    if (role === 'admin') return '/admin';
    if (role === 'sales') return '/sales';
    if (role === 'provider') return '/portal';
    return '/dashboard';
  };

  // -- Password login --
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiCall<{
        success: boolean;
        accessToken?: string;
        refreshToken?: string;
        user?: any;
        requiresVerification?: boolean;
        email?: string;
        devCode?: string;
        message?: string;
        error?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.success && response.accessToken) {
        storeAuth(response.accessToken, response.user, response.refreshToken);
        router.push(redirectByRole(response.user?.role));
      } else if (response.success && response.requiresVerification) {
        setMode('otp');
        setOtpSent(true);
        setInfo(response.devCode
          ? `Dev mode — your code is: ${response.devCode}`
          : response.message || 'Check your email for a 6-digit verification code.'
        );
      } else {
        setError(response.error || 'Login failed');
      }
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // -- OTP send --
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      const response = await apiCall<{ success: boolean; message?: string; error?: string; devCode?: string }>('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      if (response.success) {
        setOtpSent(true);
        setInfo(response.devCode
          ? `Dev mode — your code is: ${response.devCode}`
          : 'Check your email for a 6-digit verification code.'
        );
      } else {
        setError(response.error || response.message || 'Failed to send code');
      }
    } catch {
      setError('Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  // -- OTP verify --
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiCall<{ success: boolean; accessToken?: string; refreshToken?: string; user?: any; error?: string }>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, code: otpCode }),
      });

      if (response.success && response.accessToken) {
        storeAuth(response.accessToken, response.user, response.refreshToken);
        router.push(redirectByRole(response.user?.role));
      } else {
        setError(response.error || 'Invalid code');
      }
    } catch {
      setError('Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  // -- Passkey login --
  const handlePasskeyLogin = async () => {
    setError('');
    setInfo('');
    setLoading(true);

    try {
      // Step 1: Get authentication options
      const optionsRes = await fetch(`${API_URL}/auth/passkey/authenticate/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined }),
      });
      if (!optionsRes.ok) {
        setError('Server error during passkey authentication. Please try again later.');
        return;
      }
      const options = await optionsRes.json();

      // Step 2: Start browser authentication (Touch ID, Face ID, security key, etc.)
      const credential = await startAuthentication({ optionsJSON: options });

      // Step 3: Verify with server
      const verifyRes = await fetch(`${API_URL}/auth/passkey/authenticate/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || undefined,
          credential,
          challenge: options.challenge,
        }),
      });
      const result = await verifyRes.json();

      if (result.success) {
        storeAuth(result.accessToken, result.user, result.refreshToken);
        router.push(redirectByRole(result.user?.role));
      } else if (result.error?.includes('No passkey registered')) {
        setError('No passkey found for this email. Register a passkey from your account settings first, or use password/OTP login.');
      } else if (result.error?.includes('challenge mismatch')) {
        setError('Passkey session expired. Please try again.');
      } else {
        setError(result.error || 'Passkey authentication failed');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey authentication was cancelled or not available on this device.');
      } else if (err instanceof Error && err.message?.includes('No matching')) {
        setError('No matching passkey found. Register a passkey first, or try a different login method.');
      } else {
        setError('Passkey authentication failed. Make sure you have a passkey registered, or try password login.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading && mode !== 'otp') {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f7f5] dark:bg-black">
      {/* Header — inspired by Americor's clean header with logo + contact */}
      <header className="py-5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Settle<span className="text-blue-400">InPeace</span>
          </Link>
          <a
            href="mailto:help@settleinpeace.com"
            className="flex items-center gap-2 border-[1.5px] border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-full text-sm font-bold transition-colors dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline">Get Help</span>
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-lg">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-black dark:text-white">Welcome back</h1>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-6">
          {([
            { key: 'password', label: 'Password' },
            { key: 'otp', label: 'Email Code' },
            { key: 'passkey', label: 'Passkey' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setMode(tab.key); setError(''); setInfo(''); setOtpSent(false); }}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                mode === tab.key
                  ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <ErrorMessage message={error} />}
        {info && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            {info}
          </div>
        )}

        {/* Password mode */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-medium"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        )}

        {/* OTP mode */}
        {mode === 'otp' && !otpSent && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-medium"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {mode === 'otp' && otpSent && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Enter the 6-digit code sent to {email}
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                required
                placeholder="000000"
                className="w-full px-3 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white text-center text-2xl tracking-widest font-bold"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-medium"
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <button
              type="button"
              onClick={() => { setOtpSent(false); setOtpCode(''); setInfo(''); }}
              className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← Use a different email
            </button>
          </form>
        )}

        {/* Passkey mode */}
        {mode === 'passkey' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a4 4 0 11-8 0 4 4 0 018 0zM12 11v8m-2-4h4m-6-4h8a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2v-6a2 2 0 012-2z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Use Touch ID, Face ID, or a security key to log in instantly — no password needed.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional — speeds up login)"
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white mb-3"
              />
              <button
                onClick={handlePasskeyLogin}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-medium"
              >
                {loading ? 'Authenticating...' : '🔐 Login with Passkey'}
              </button>
            </div>
          </div>
        )}

        {/* Footer links */}
        <div className="mt-6 space-y-2 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:underline font-medium">Register</Link>
          </p>
          {mode === 'password' && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/forgot-password" className="text-blue-600 hover:underline">Forgot password?</Link>
            </p>
          )}
          <p className="text-sm text-zinc-600 dark:text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            Staff member?{' '}
            <Link href="/staff/login" className="text-blue-600 hover:underline font-medium">Staff Login →</Link>
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Debt relief provider?{' '}
            <Link href="/portal" className="text-blue-600 hover:underline font-medium">Provider Portal →</Link>
          </p>
        </div>
      </div>
      </main>

      {/* Footer — minimal, like Americor's clean footer */}
      <footer className="py-4 px-4 text-center text-xs text-slate-400 dark:text-zinc-500">
        <div className="max-w-7xl mx-auto">
          © {new Date().getFullYear()} Settle In Peace, Inc. ·{' '}
          <Link href="/privacy" className="hover:text-slate-600 dark:hover:text-zinc-300">Privacy</Link> ·{' '}
          <Link href="/terms" className="hover:text-slate-600 dark:hover:text-zinc-300">Terms</Link> ·{' '}
          <Link href="/staff/login" className="hover:text-slate-600 dark:hover:text-zinc-300">Staff Login</Link>
        </div>
      </footer>
    </div>
  );
}
