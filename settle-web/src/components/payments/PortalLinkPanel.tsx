'use client';

import { useState } from 'react';
import { getAuthenticatedApi } from '@/lib/api';

/**
 * Staff-side portal-link minter + sender for a collections account.
 *
 * Generates the debtor-facing /pay/<token> URL via
 * POST /collections/accounts/:id/portal-link and can deliver it by email
 * and/or SMS via POST .../portal-link/send — always a manual per-account
 * staff action. Every mint/revoke/send writes an audit note on the account
 * server-side.
 */
interface PortalLinkResult {
  collectionAccountId: string;
  token: string;
  url: string;
  issuedAt: string;
  rotated: boolean;
}

interface PortalLinkSendResult extends PortalLinkResult {
  deliveries: Array<{ channel: 'email' | 'sms'; sent: boolean; recipient: string }>;
}

export default function PortalLinkPanel({
  accountId,
  existingIssuedAt,
}: {
  accountId: string;
  existingIssuedAt?: string;
}) {
  const [link, setLink] = useState<PortalLinkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [issuedAt, setIssuedAt] = useState<string | undefined>(existingIssuedAt);
  const [revoked, setRevoked] = useState(false);
  const [sendSummary, setSendSummary] = useState('');

  const sendLink = async (channel: 'email' | 'sms') => {
    setBusy(true);
    setError('');
    setCopied(false);
    setSendSummary('');
    try {
      const res = await getAuthenticatedApi()<PortalLinkSendResult>(
        `/collections/accounts/${accountId}/portal-link/send`,
        { method: 'POST', body: JSON.stringify({ [channel]: true }) },
      );
      setLink(res);
      setIssuedAt(res.issuedAt);
      setRevoked(false);
      setSendSummary(
        res.deliveries
          .map((d) => `${d.channel === 'email' ? 'Email' : 'SMS'} ${d.sent ? 'sent' : 'FAILED'} → ${d.recipient}`)
          .join(' · '),
      );
    } catch (err: any) {
      setError(err?.message || `Could not send the portal link by ${channel}`);
    } finally {
      setBusy(false);
    }
  };

  const mint = async (rotate: boolean) => {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const res = await getAuthenticatedApi()<PortalLinkResult>(
        `/collections/accounts/${accountId}/portal-link`,
        { method: 'POST', body: JSON.stringify({ rotate }) },
      );
      setLink(res);
      setIssuedAt(res.issuedAt);
      setRevoked(false);
    } catch (err: any) {
      setError(err?.message || 'Could not generate the portal link');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError('');
    try {
      await getAuthenticatedApi()(`/collections/accounts/${accountId}/portal-link`, {
        method: 'DELETE',
      });
      setLink(null);
      setIssuedAt(undefined);
      setRevoked(true);
    } catch (err: any) {
      setError(err?.message || 'Could not revoke the portal link');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setError('Copy failed — select and copy the link manually.');
    }
  };

  return (
    <div className="space-y-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-white">
          Debtor payment portal link
        </h3>
        {issuedAt && !revoked && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            issued {new Date(issuedAt).toLocaleString()}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Generates a unique link the debtor can use to view their balance and pay
        online. Delivery is always a manual staff action — the email includes
        the required disclosures and every send is audit-noted on the account.
      </p>

      {link?.url && (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-700 dark:text-zinc-300">
            {link.url}
          </code>
          <button
            onClick={copy}
            className="px-3 py-2 text-xs font-medium rounded bg-zinc-700 hover:bg-zinc-800 text-white"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => mint(false)}
          disabled={busy}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Working…' : link || issuedAt ? 'Get Link' : 'Generate Link'}
        </button>
        {(link || issuedAt) && !revoked && (
          <>
            <button
              onClick={() => mint(true)}
              disabled={busy}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              title="Invalidate the current link and mint a new one"
            >
              Rotate
            </button>
            <button
              onClick={revoke}
              disabled={busy}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Revoke
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Send link:</span>
        <button
          onClick={() => sendLink('email')}
          disabled={busy}
          className="px-4 py-2 border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg text-sm font-medium disabled:opacity-50"
          title="Email the link to the debtor's email on file"
        >
          Email
        </button>
        <button
          onClick={() => sendLink('sms')}
          disabled={busy}
          className="px-4 py-2 border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg text-sm font-medium disabled:opacity-50"
          title="Text the link to the debtor's phone on file"
        >
          SMS
        </button>
      </div>

      {sendSummary && (
        <p className="text-xs text-green-700 dark:text-green-400">{sendSummary}</p>
      )}
      {revoked && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Link revoked — the previous URL no longer resolves.
        </p>
      )}
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}
    </div>
  );
}
