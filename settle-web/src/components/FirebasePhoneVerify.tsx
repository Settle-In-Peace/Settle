'use client';

import { useEffect, useRef, useState } from 'react';
import { getFirebaseAuth, RecaptchaVerifier, signInWithPhoneNumber } from '../lib/firebase';

interface FirebasePhoneVerifyProps {
  phone: string;
  token: string | null;
  onVerified: () => void;
}

export default function FirebasePhoneVerify({ phone, token, onVerified }: FirebasePhoneVerifyProps) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'verified'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const confirmationRef = useRef<any>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      try {
        recaptchaRef.current?.clear();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleSend = async () => {
    setError('');
    setMessage('');
    setStatus('sending');

    try {
      const container = document.getElementById('firebase-recaptcha');
      if (!container) {
        throw new Error('reCAPTCHA container not found');
      }
      container.innerHTML = '';

      const auth = getFirebaseAuth();
      recaptchaRef.current = new RecaptchaVerifier(auth, 'firebase-recaptcha', {
        size: 'invisible',
      });

      const digits = phone.replace(/\D/g, '');
      const e164Phone = phone.startsWith('+') ? phone : digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

      const confirmation = await signInWithPhoneNumber(auth, e164Phone, recaptchaRef.current);
      confirmationRef.current = confirmation;
      setStatus('sent');
      setMessage('Code sent to your phone.');
    } catch (err: any) {
      setStatus('idle');
      setError(err.message || 'Failed to send code');
    }
  };

  const handleVerify = async () => {
    if (!confirmationRef.current || code.length < 6) return;
    setError('');
    setMessage('');
    setStatus('verifying');

    try {
      const credential = await confirmationRef.current.confirm(code);
      const idToken = await credential.user.getIdToken();

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';
      const digits = phone.replace(/\D/g, '');
      const e164Phone = phone.startsWith('+') ? phone : digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

      const res = await fetch(`${apiUrl}/auth/verify-phone-firebase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ idToken, phone: e164Phone }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to verify phone');
      }

      setStatus('verified');
      setMessage('Phone verified successfully');
      onVerified();
    } catch (err: any) {
      setStatus('sent');
      setError(err.message || 'Invalid or expired code');
    }
  };

  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs font-medium rounded-full">
        Verified
      </span>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {status === 'idle' && (
        <button
          onClick={handleSend}
          disabled={!phone}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        >
          Verify phone number
        </button>
      )}

      {status === 'sending' && <span className="text-sm text-zinc-500">Sending...</span>}

      {(status === 'sent' || status === 'verifying') && (
        <div className="space-y-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter 6-digit code"
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white text-center text-lg tracking-widest font-bold"
          />
          <div className="flex gap-2">
            <button
              onClick={handleVerify}
              disabled={code.length !== 6 || status === 'verifying'}
              className="flex-1 py-2 px-4 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {status === 'verifying' ? 'Verifying...' : 'Verify'}
            </button>
            <button
              onClick={handleSend}
              disabled={status === 'verifying'}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Resend
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
          {message}
        </div>
      )}
      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div id="firebase-recaptcha" className="hidden" />
    </div>
  );
}
