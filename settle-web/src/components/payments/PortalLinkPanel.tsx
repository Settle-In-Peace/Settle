'use client';

import { useState } from 'react';
import { getAuthenticatedApi } from '@/lib/api';

/**
 * Staff-side portal-link minter for a collections account.
 *
 * Generates the debtor-facing /pay/<token> URL via
 * POST /collections/accounts/:id/portal-link. Generation only — this panel
 * deliberately does NOT send anything; pasting the link into an SMS/email is
 * a human + compliance decision. Every mint/revoke writes an audit note on
 * the account server-side.
 */
interface PortalLinkResult {
  collectionAccountId: string;
  token: string;
  url: string;
  issuedAt: string;
  rotated: boolean;
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
        online. The link is only created here — it is never sent automatically.
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

      {revoked && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Link revoked — the previous URL no longer resolves.
        </p>
      )}
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}
    </div>
  );
}
