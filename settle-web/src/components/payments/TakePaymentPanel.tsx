'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ProcessorPayment,
  ProcessorStatusEntry,
  chargeProcessorPayment,
  getAccountProcessorPayments,
  getPaymentProcessorStatus,
} from '@/lib/api';

/**
 * "Take Payment" panel for a collections account — high-risk processor layer
 * (settle-api /payment-processors/*).
 *
 * PCI posture (important):
 *   - When NMI is configured, this mounts Collect.js hosted fields — card
 *     number/expiry/CVV render inside NMI-owned iframes and are tokenized in
 *     the debtor's browser. The only thing POSTed to settle-api is the
 *     single-use `payment_token`. Raw PAN/CVV NEVER reaches our servers.
 *   - Without hosted fields (AuthNet Accept.js not yet mounted, or NMI
 *     public key missing) a staff member may paste an existing vault id /
 *     token captured via the processor's hosted page.
 *
 * FDCPA/state: the debtor must see and acknowledge the disclosure text
 * before the charge is submitted — the API refuses unacknowledged charges.
 *
 * Graceful degradation: unconfigured processors render a setup hint; the
 * panel never crashes the page.
 */

declare global {
  interface Window {
    CollectJS?: {
      configure: (opts: Record<string, any>) => void;
      startPaymentRequest: () => void;
    };
  }
}

const DEFAULT_DISCLOSURE =
  'By submitting this payment you authorize us to charge the payment method ' +
  'provided for the amount shown. Any convenience fee, if permitted in your ' +
  'state, is disclosed and included in the total. This communication is from ' +
  'a debt collector.';

const inputCls =
  'w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm';
const labelCls = 'block text-xs text-zinc-500 dark:text-zinc-400 mb-1';

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  declined: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  voided: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  refunded: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

function processorLabel(name: string) {
  return name === 'nmi' ? 'NMI' : name === 'authorizenet' ? 'Authorize.Net' : 'Stripe';
}

const PROCESSOR_ENV_HINTS: Record<string, string> = {
  nmi: 'NMI_SECURITY_KEY (+ NMI_PUBLIC_KEY for hosted fields)',
  authorizenet: 'AUTHNET_API_LOGIN_ID + AUTHNET_TRANSACTION_KEY',
  stripe: 'STRIPE_SECRET_KEY',
};

export default function TakePaymentPanel({
  accountId,
  debtorId,
}: {
  accountId: string;
  debtorId?: string;
}) {
  const [status, setStatus] = useState<ProcessorStatusEntry[] | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [payments, setPayments] = useState<ProcessorPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [processor, setProcessor] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [disclosureText, setDisclosureText] = useState(DEFAULT_DISCLOSURE);
  const [acknowledged, setAcknowledged] = useState(false);
  const [charging, setCharging] = useState(false);

  // Collect.js (NMI hosted fields)
  const hostedDivRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);
  const [hostedReady, setHostedReady] = useState(false);
  const [hostedError, setHostedError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAccountProcessorPayments(accountId);
      setPayments(list || []);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      try {
        const s = await getPaymentProcessorStatus();
        if (cancelled) return;
        setStatus(s.processors || []);
        const firstConfigured = (s.processors || []).find((p) => p.configured);
        if (firstConfigured) setProcessor(firstConfigured.name);
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

  const activeProcessor = (status || []).find((p) => p.name === processor);
  const hosted = activeProcessor?.hostedFields;

  // Mount NMI Collect.js hosted fields when selected + configured.
  useEffect(() => {
    if (!hosted || hosted.kind !== 'collectjs' || !hosted.tokenizationKey) {
      setHostedReady(false);
      return;
    }
    let cancelled = false;
    setHostedError('');

    const configure = () => {
      try {
        window.CollectJS?.configure({
          variant: 'inline',
          paymentTokenCreated: (t: { token: string }) => {
            tokenRef.current = t.token;
          },
          // inline fields mount into #ccnumber / #ccexp / #cvv divs below
        });
        if (!cancelled) setHostedReady(true);
      } catch (e: any) {
        if (!cancelled) setHostedError(e?.message || 'Collect.js failed to configure');
      }
    };

    if (window.CollectJS) {
      configure();
      return;
    }
    const script = document.createElement('script');
    script.src = hosted.scriptUrl;
    script.setAttribute('data-tokenization-key', hosted.tokenizationKey);
    script.setAttribute('data-variant', 'inline');
    script.onload = configure;
    script.onerror = () =>
      setHostedError('Could not load Collect.js — check NMI keys / network.');
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [hosted?.kind, hosted?.scriptUrl, hosted?.tokenizationKey]);

  const submitCharge = async (useVault: boolean) => {
    setError('');
    setNotice('');
    const amountCents = Math.round(parseFloat(amount || '0') * 100);
    const feeCents = Math.round(parseFloat(fee || '0') * 100);
    if (!amountCents || amountCents <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }
    if (!acknowledged) {
      setError('The debtor must acknowledge the disclosure before charging.');
      return;
    }

    if (useVault && !vaultId.trim()) {
      setError('Enter a vault / saved payment-method id.');
      return;
    }

    setCharging(true);
    try {
      let paymentToken: string | undefined;
      if (!useVault) {
        if (!hostedReady || !window.CollectJS) {
          setError('Hosted fields are not ready — or use a vault id below.');
          setCharging(false);
          return;
        }
        tokenRef.current = null;
        // Collect.js tokenizes the iframe contents in the browser and calls
        // paymentTokenCreated — the card data never touches this page/app.
        window.CollectJS.startPaymentRequest();
        const token = await new Promise<string>((resolve, reject) => {
          const started = Date.now();
          const timer = setInterval(() => {
            if (tokenRef.current) {
              clearInterval(timer);
              resolve(tokenRef.current);
            } else if (Date.now() - started > 30_000) {
              clearInterval(timer);
              reject(new Error('Tokenization timed out — try again.'));
            }
          }, 100);
        }).catch((e) => {
          setError(e.message);
          return undefined;
        });
        if (!token) {
          setCharging(false);
          return;
        }
        paymentToken = token;
      }

      const res = await chargeProcessorPayment({
        collectionAccountId: accountId,
        debtorId,
        amountCents,
        convenienceFeeCents: feeCents || undefined,
        paymentToken,
        vaultId: useVault ? vaultId.trim() : undefined,
        processor: processor || undefined,
        disclosureAcknowledged: acknowledged,
        disclosureText,
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : undefined,
      });

      if (res.status === 'approved') {
        setNotice(
          `Payment approved — ${(res.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` +
            (res.cardBrand ? ` on ${res.cardBrand} ••••${res.cardLast4 ?? ''}` : '') +
            ` (txn ${res.processorTxnId ?? res.id}).`,
        );
        setAmount('');
        setVaultId('');
        setAcknowledged(false);
      } else {
        setError(
          `Payment ${res.status}${res.responseText ? `: ${res.responseText}` : ''}` +
            (res.status === 'declined' ? ' — declines are never retried automatically.' : ''),
        );
      }
      await load();
    } catch (err: any) {
      setError(err?.message || 'Payment failed');
    } finally {
      setCharging(false);
    }
  };

  const formatMoney = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const unconfigured = (status || []).filter((p) => !p.configured);

  return (
    <div className="space-y-4">
      {/* Processor status strip */}
      {statusLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking processors…</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(status || []).map((p) => (
              <span
                key={p.name}
                className={`px-2 py-1 text-xs font-medium rounded ${
                  p.configured
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {processorLabel(p.name)} — {p.configured ? `ready (${p.environment})` : 'not configured'}
              </span>
            ))}
          </div>
          {unconfigured.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">
                {unconfigured.map((p) => processorLabel(p.name)).join(', ')} not configured
              </p>
              <p className="mt-1 text-xs">
                Set {unconfigured.map((p) => PROCESSOR_ENV_HINTS[p.name] ?? `${p.name} credentials`).join('; ')}{' '}
                on the API. Charges route in PAYMENT_PROCESSOR_PRIORITY order and fail over only on
                gateway outages — declined cards are never retried.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Charge form */}
      {(status || []).some((p) => p.configured) && (
        <div className="space-y-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Processor</label>
              <select
                value={processor}
                onChange={(e) => setProcessor(e.target.value)}
                className={inputCls}
              >
                {(status || []).map((p) => (
                  <option key={p.name} value={p.name} disabled={!p.configured}>
                    {processorLabel(p.name)}
                    {!p.configured ? ' (not configured)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Amount (USD) *</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Convenience fee (USD)</label>
              <input
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={inputCls}
              />
            </div>
          </div>

          {/* Hosted fields — NMI Collect.js. PAN/CVV live in gateway iframes. */}
          {hosted?.kind === 'collectjs' && hosted.tokenizationKey ? (
            <div ref={hostedDivRef} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Card number</label>
                  <div id="ccnumber" className={inputCls} style={{ minHeight: 38 }} />
                </div>
                <div>
                  <label className={labelCls}>Expiry (MMYY)</label>
                  <div id="ccexp" className={inputCls} style={{ minHeight: 38 }} />
                </div>
                <div>
                  <label className={labelCls}>CVV</label>
                  <div id="cvv" className={inputCls} style={{ minHeight: 38 }} />
                </div>
              </div>
              {hostedError && (
                <p className="text-xs text-red-600 dark:text-red-400">{hostedError}</p>
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Card fields are hosted by NMI (Collect.js) — card data never touches Settle servers;
                we receive a single-use payment token.
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Hosted card fields are available once the selected processor's public
              tokenization key is configured
              {activeProcessor?.name === 'nmi' ? ' (NMI_PUBLIC_KEY / Collect.js)' : ''}.
            </p>
          )}

          {/* Card-on-file vault charge */}
          <div>
            <label className={labelCls}>
              Saved vault / payment-method id (card on file — optional)
            </label>
            <input
              value={vaultId}
              onChange={(e) => setVaultId(e.target.value)}
              placeholder="customer_vault_id / pm_…"
              className={inputCls}
            />
          </div>

          {/* FDCPA/state disclosure */}
          <div>
            <label className={labelCls}>Disclosure shown to debtor</label>
            <textarea
              value={disclosureText}
              onChange={(e) => setDisclosureText(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              The debtor was shown the disclosure above (including any
              convenience fee permitted in their state) and authorized this
              charge. Acknowledgment is timestamped on the payment record.
            </span>
          </label>

          <div className="flex gap-3">
            {hosted?.kind === 'collectjs' && hosted.tokenizationKey && (
              <button
                onClick={() => submitCharge(false)}
                disabled={charging || !hostedReady}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {charging ? 'Processing…' : 'Charge Card'}
              </button>
            )}
            <button
              onClick={() => submitCharge(true)}
              disabled={charging || !vaultId.trim()}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Charge Vault
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="p-3 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 rounded-lg text-sm">
          {notice}
        </div>
      )}
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Payment history */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-white mb-2">Payment history</h3>
        {loading && !payments.length ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading payments…</p>
        ) : payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-1.5 pr-3">Date</th>
                  <th className="py-1.5 pr-3">Processor</th>
                  <th className="py-1.5 pr-3">Type</th>
                  <th className="py-1.5 pr-3">Amount</th>
                  <th className="py-1.5 pr-3">Card</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5">Ref / note</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-100 dark:border-zinc-900 text-zinc-700 dark:text-zinc-300"
                  >
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3">{processorLabel(p.processor)}</td>
                    <td className="py-1.5 pr-3">{p.type}</td>
                    <td className="py-1.5 pr-3">{formatMoney(p.amountCents)}</td>
                    <td className="py-1.5 pr-3">
                      {p.cardBrand ? `${p.cardBrand} ••••${p.cardLast4 ?? ''}` : '—'}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded font-medium ${STATUS_BADGE[p.status] ?? STATUS_BADGE.pending}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-zinc-500 dark:text-zinc-400">
                      {p.responseText || p.failureReason || p.processorTxnId || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No payments recorded yet.</p>
        )}
      </div>
    </div>
  );
}
