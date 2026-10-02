'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DialerCall,
  DialerProviderStatus,
  getDialerCalls,
  getDialerStatus,
  hangupDialerCall,
  placeDialerCall,
} from '@/lib/dialer';

/**
 * Click-to-call panel + call log for a collection account.
 *
 * Uses the provider-agnostic /dialer/* API (Telnyx Call Control or ViciDial,
 * selected by DIALER_PROVIDER on the API). Graceful degradation: when no
 * provider is configured the panel shows a setup hint instead of the dial
 * form — it never crashes the page.
 *
 * TCPA: the call button requires the agent to attest that consent to call is
 * on file; the API additionally blocks DNC numbers and autodial without
 * consent at the service layer.
 */

const inputCls =
  'w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm';

const IN_FLIGHT = new Set(['queued', 'dialing', 'ringing', 'answered']);

function statusBadge(status: string) {
  const base = 'px-2 py-0.5 rounded text-xs font-medium';
  switch (status) {
    case 'completed':
      return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300`;
    case 'answered':
    case 'ringing':
    case 'dialing':
    case 'queued':
      return `${base} bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300`;
    case 'failed':
    case 'no_answer':
    case 'busy':
      return `${base} bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300`;
    default:
      return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`;
  }
}

export default function DialerPanel({
  accountId,
  contactId,
}: {
  accountId?: string;
  contactId?: string;
}) {
  const [status, setStatus] = useState<DialerProviderStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [calls, setCalls] = useState<DialerCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [hangingUp, setHangingUp] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getDialerCalls({
        collectionAccountId: accountId,
        contactId,
      });
      setCalls(list || []);
    } catch (err: any) {
      // Non-fatal — the call log is supplementary to the dial form.
      if (!calls.length) setCalls([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, contactId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      try {
        const s = await getDialerStatus();
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const configuredProvider = status?.providers.find(
    (p) => p.name === status.activeProvider && p.configured,
  );
  const anyConfigured = status?.providers.some((p) => p.configured) ?? false;

  const handleDial = async () => {
    if (!phone.trim()) {
      setError('Enter a phone number to dial.');
      return;
    }
    if (!consentChecked) {
      setError(
        'Consent attestation is required before dialing — check the TCPA consent box.',
      );
      return;
    }
    setDialing(true);
    setError('');
    try {
      await placeDialerCall({
        to: phone.trim(),
        collectionAccountId: accountId,
        contactId,
        consentConfirmed: true,
        manualDial: true, // click-to-call — human-initiated, not autodial
      });
      setPhone('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to place call');
    } finally {
      setDialing(false);
    }
  };

  const handleHangup = async (callId: string) => {
    setHangingUp(callId);
    try {
      await hangupDialerCall(callId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to hang up');
    } finally {
      setHangingUp(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Provider status */}
      {statusLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Checking dialer provider…
        </p>
      ) : !anyConfigured ? (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Dialer not configured</p>
          <p className="mt-1 text-xs">
            Set <code>TELNYX_API_KEY</code>, <code>TELNYX_FROM_NUMBER</code> and{' '}
            <code>TELNYX_CONNECTION_ID</code> on the API — or set{' '}
            <code>DIALER_PROVIDER=vicidial</code> with{' '}
            <code>VICIDIAL_BASE_URL</code> / <code>VICIDIAL_API_USER</code> /{' '}
            <code>VICIDIAL_API_PASS</code> / <code>VICIDIAL_AGENT_USER</code>.
            Previously logged calls still appear below.
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Provider: <span className="font-medium">{status?.activeProvider}</span>
          {configuredProvider ? ' (ready)' : ''}
        </p>
      )}

      {/* Click-to-call */}
      {configuredProvider && (
        <div className="space-y-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number to dial (E.164 or US 10-digit)"
            className={inputCls}
          />
          <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              The contact has provided express consent to be called and the
              number is not on a Do-Not-Call list (TCPA). This attestation is
              recorded on the call log.
            </span>
          </label>
          <button
            onClick={handleDial}
            disabled={dialing || !phone.trim() || !consentChecked}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {dialing ? 'Dialing…' : 'Call'}
          </button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Calls are placed as manual click-to-call. DNC-listed numbers are
            blocked server-side.
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Call log */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-white mb-2">
          Call log
        </h3>
        {loading && !calls.length ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading calls…
          </p>
        ) : calls.length ? (
          <div className="space-y-2">
            {calls.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-900 dark:text-white">
                    {c.direction === 'outbound' ? '→' : '←'} {c.phoneNumber}
                  </div>
                  <span className={statusBadge(c.status)}>{c.status}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {c.provider} · {new Date(c.createdAt).toLocaleString()}
                  {c.duration != null ? ` · ${c.duration}s` : ''}
                  {c.hangupCause ? ` · ${c.hangupCause}` : ''}
                  {c.manualDial ? '' : ' · autodial'}
                  {c.consentConfirmed ? ' · consent on file' : ''}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {IN_FLIGHT.has(c.status) && (
                    <button
                      onClick={() => handleHangup(c.id)}
                      disabled={hangingUp === c.id}
                      className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
                    >
                      {hangingUp === c.id ? 'Hanging up…' : 'Hang up'}
                    </button>
                  )}
                  {c.recordingUrl && (
                    <a
                      href={c.recordingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Recording
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No calls logged yet.
          </p>
        )}
      </div>
    </div>
  );
}
