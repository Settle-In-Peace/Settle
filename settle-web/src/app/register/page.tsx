'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { startRegistration } from '@simplewebauthn/browser';
import { createJsonApiClient } from '@settle/shared-sdk/auth';
import { storeAuth, isValidEmail, clearAuth } from '../../lib/authUtils';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import PasswordInput from '../../components/PasswordInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');

  const apiCall = createJsonApiClient({
    getBaseUrl: () => API_URL,
    getToken: () => null,
    timeout: 0,
    onUnauthorized: () => {
      clearAuth();
      router.push('/login');
    },
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!isValidEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      setError('Password must contain uppercase, lowercase, number, and special character');
      return;
    }

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
      }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      if (response.success && response.accessToken) {
        storeAuth(response.accessToken, response.user, response.refreshToken);
        setInfo('Account created! You can now add a passkey for faster login.');
        router.push('/dashboard');
      } else if (response.success && response.requiresVerification && response.email) {
        const query = new URLSearchParams({ mode: 'otp', email: response.email, sent: '1' });
        if (response.devCode) query.set('devCode', response.devCode);
        router.push(`/login?${query.toString()}`);
      } else {
        setError(response.error || 'Registration failed');
      }
    } catch (err) {
      if (err instanceof Error && (err as any).name === 'AbortError') {
        setError('Request was cancelled. This is often caused by a browser extension. Try disabling extensions or use an incognito window.');
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Register with passkey (passwordless) — creates account and immediately registers a passkey
  const handlePasskeyRegister = async () => {
    setError('');
    setInfo('');

    if (!isValidEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create account with a random password (passkey-only account)
      const tempPassword = `${crypto.randomUUID()}!A1a`;
      const regRes = await apiCall<{
        success: boolean;
        accessToken?: string;
        refreshToken?: string;
        user?: any;
        requiresVerification?: boolean;
        email?: string;
        devCode?: string;
        message?: string;
        error?: string;
      }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password: tempPassword, firstName, lastName }),
      });

      if (!regRes.success) {
        setError(regRes.error || 'Registration failed');
        return;
      }

      if (regRes.requiresVerification && regRes.email) {
        const query = new URLSearchParams({ mode: 'otp', email: regRes.email, sent: '1' });
        if (regRes.devCode) query.set('devCode', regRes.devCode);
        router.push(`/login?${query.toString()}`);
        return;
      }

      if (!regRes.accessToken) {
        setError('Registration failed');
        return;
      }

      storeAuth(regRes.accessToken, regRes.user, regRes.refreshToken);

      // Step 2: Get passkey registration options
      const optionsRes = await fetch(`${API_URL}/auth/passkey/register/options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${regRes.accessToken}`,
        },
      });
      const options = await optionsRes.json();

      // Step 3: Start browser passkey registration (Touch ID, Face ID, etc.)
      const credential = await startRegistration({ optionsJSON: options });

      // Step 4: Verify with server
      const verifyRes = await fetch(`${API_URL}/auth/passkey/register/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${regRes.accessToken}`,
        },
        body: JSON.stringify({ credential, challenge: options.challenge }),
      });
      const result = await verifyRes.json();

      if (result.verified) {
        setInfo('Passkey registered! Redirecting to dashboard...');
        router.push('/dashboard');
      } else {
        setInfo('Account created, but passkey setup failed. You can add it later in settings.');
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey registration was cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-black px-4">
      <div className="w-full max-w-md p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-lg">

        {/* Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-block text-xl font-bold text-blue-600 mb-2">
            Settle<span className="text-blue-400">InPeace</span>
          </Link>
          <h1 className="text-2xl font-bold text-black dark:text-white">Create your account</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Free assessment, no obligation, no credit check</p>
        </div>

        {error && <ErrorMessage message={error} />}
        {info && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
            {info}
          </div>
        )}

        {/* Form fields (shared by both password and passkey registration) */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Confirm Password</label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-medium"
          >
            Create Account
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-xs text-zinc-400 font-medium">OR</span>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* Passkey registration button */}
        <button
          onClick={handlePasskeyRegister}
          disabled={loading}
          className="w-full py-2.5 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a4 4 0 11-8 0 4 4 0 018 0zM12 11v8m-2-4h4m-6-4h8a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2v-6a2 2 0 012-2z" />
          </svg>
          Sign Up with Passkey
        </button>
        <p className="text-xs text-zinc-400 text-center mt-2">
          Passwordless — use Touch ID, Face ID, or a security key
        </p>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">Login</Link>
        </p>
      </div>
    </div>
  );
}
