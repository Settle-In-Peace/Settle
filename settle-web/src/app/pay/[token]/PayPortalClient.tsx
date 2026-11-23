'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { API_URL } from '@/lib/apiUrl';

/**
 * Debtor payment portal — resolves the bearer token via
 * GET /portal/pay/:token, shows a read-only balance/creditor summary, and
 * submits a one-time card payment via Stripe Elements →
 * POST /portal/pay/:token/payment (+ /payment/complete after 3DS).
 *
 * Fails closed: an invalid/revoked token renders a dead-end notice and no
 * account data. Card fields only render when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * is configured — otherwise a contact-the-office fallback shows.
 *
 * Legal copy is NOT invented here: the mini-Miranda and payment-authorization
 * disclosure are rendered verbatim from the API response (house text shared
 * with payment-processors / collection-ai).
 */

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

const money = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const STATUS_LABEL: Record<string, string> = {
  new: 'Open',
  active: 'Open',
  contacted: 'Open',
  payment_plan: 'Payment plan',
  settled: 'Settled',
  paid_in_full: 'Paid in full',
  litigation: 'In litigation',
  charge_off: 'Charged off',
  bankruptcy: 'Bankruptcy',
  deceased: 'Deceased',
  closed: 'Closed',
};

interface PortalSummary {
  account: {
    accountNumber?: string;
    status: string;
    originalBalance: number;
    currentBalance: number;
    lastPaymentDate?: string;
  };
  creditorName?: string;
  debtorFirstName?: string;
  activePlans: Array<{
    id: string;
    totalAmount: number;
    paymentAmount: number;
    frequency: string;
    numberOfPayments: number;
    paymentsMade: number;
    totalPaid: number;
    remainingBalance: number;
    nextPaymentDate?: string;
    status: string;
  }>;
  nextPaymentDue: { amount: number; scheduledDate: string; installmentNumber: number } | null;
  miniMiranda: string;
  paymentDisclosure: string;
}

interface PaymentResponse {
  success: boolean;
  status?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  amount?: number;
}

const inputCls =
  'w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base text-zinc-900 dark:text-zinc-100';
const labelCls = 'block text-xs text-zinc-500 dark:text-zinc-400 mb-1';

function PaymentForm({
  token,
  summary,
  onPaid,
}: {
  token: string;
  summary: PortalSummary;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState(String(summary.account.currentBalance));
  const [name, setName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async () => {
    setError('');
    setNotice('');
    if (!stripe || !elements) {
      setError('Payment form is still loading — try again in a moment.');
      return;
    }
    const amt = Math.round(parseFloat(amount || '0') * 100) / 100;
    if (!amt || amt <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    if (amt > summary.account.currentBalance) {
      setError('The amount cannot be more than the current balance.');
      return;
    }
    if (!acknowledged) {
      setError('Please read and acknowledge the payment authorization below.');
      return;
    }

    setBusy(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Card field is not ready.');

      const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
        type: 'card',
        card,
        billing_details: name.trim() ? { name: name.trim() } : undefined,
      });
      if (pmError) throw new Error(pmError.message || 'Could not read the card.');
      if (!paymentMethod) throw new Error('Could not read the card.');

      const res = await fetch(`${API_URL}/portal/pay/${encodeURIComponent(token)}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, stripePaymentMethodId: paymentMethod.id }),
      });
      const data: PaymentResponse & { message?: string } = await res
        .json()
        .catch(() => ({} as PaymentResponse));
      if (!res.ok) {
        throw new Error(data?.message || 'Payment could not be completed.');
      }

      if (data.status === 'requires_action' && data.clientSecret && data.paymentIntentId) {
        // 3DS / SCA: finish authentication in the browser, then credit.
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmError) throw new Error(confirmError.message || 'Card authentication failed.');

        const completeRes = await fetch(
          `${API_URL}/portal/pay/${encodeURIComponent(token)}/payment/complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId: data.paymentIntentId }),
          },
        );
        const complete = await completeRes.json().catch(() => ({}));
        if (!completeRes.ok) {
          throw new Error(complete?.message || 'Payment verification failed.');
        }
      } else if (!data.success) {
        throw new Error('Payment could not be completed. No charge was made.');
      }

      setNotice(`Payment received — ${money(amt)}. Your balance has been updated.`);
      onPaid();
    } catch (err: any) {
      setError(err?.message || 'Payment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Payment amount (USD)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Name on card</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="cc-name"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Card details</label>
        {/* Always-white container — Stripe styles its own text color, keep the
            iframe background fixed so digits stay readable in dark mode. */}
        <div className="w-full px-3 py-3 rounded border border-zinc-300 bg-white">
          <CardElement
            options={{
              style: {
                base: { fontSize: '16px', color: '#18181b', '::placeholder': { color: '#a1a1aa' } },
              },
            }}
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Card details are handled by Stripe — they never touch our servers.
        </p>
      </div>

      {/* Payment authorization disclosure — verbatim house text from the API */}
      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{summary.paymentDisclosure}</p>
      </div>
      <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5"
        />
        <span>I have read and authorize the charge described above.</span>
      </label>

      <button
        onClick={submit}
        disabled={busy || !stripe}
        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50"
      >
        {busy ? 'Processing…' : 'Pay Now'}
      </button>

      {notice && (
        <div className="p-3 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 rounded-lg text-sm">
          {notice}
        </div>
      )}
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}
    </div>
  );
}

export default function PayPortalClient({ token }: { token: string }) {
  const [summary, setSummary] = useState<PortalSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/portal/pay/${encodeURIComponent(token)}`);
      if (!res.ok) {
        setState('invalid');
        return;
      }
      setSummary(await res.json());
      setState('ready');
    } catch {
      setState('invalid');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-zinc-500 dark:text-zinc-400">Loading your account…</p>
      </div>
    );
  }

  // Fail closed — a bad/expired/revoked token gets a dead-end, no data.
  if (state === 'invalid' || !summary) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
            This payment link is invalid or has expired
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            If you believe this is a mistake, please contact the office that sent
            you this link and ask them to issue a new one.
          </p>
        </div>
      </div>
    );
  }

  const { account } = summary;
  const balanceDue = Number(account.currentBalance);

  return (
    <div className="min-h-[60vh] bg-zinc-50 dark:bg-black py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {summary.debtorFirstName ? `${summary.debtorFirstName}, your` : 'Your'} account summary
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Review your balance and make a secure payment.
          </p>
        </div>

        {/* Balance + creditor — plainly shown */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Current balance
              </p>
              <p className="text-3xl font-black text-zinc-900 dark:text-white">
                {money(balanceDue)}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Original balance {money(account.originalBalance)}
              </p>
            </div>
            <div className="text-right space-y-1">
              {summary.creditorName && (
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {summary.creditorName}
                </p>
              )}
              {account.accountNumber && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Account {account.accountNumber}
                </p>
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Status: {STATUS_LABEL[account.status] ?? account.status}
              </p>
              {account.lastPaymentDate && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Last payment: {account.lastPaymentDate}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Active payment plan / next due */}
        {summary.nextPaymentDue && (
          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              Next scheduled payment:{' '}
              <strong>{money(summary.nextPaymentDue.amount)}</strong> due{' '}
              {summary.nextPaymentDue.scheduledDate}
            </p>
          </div>
        )}
        {summary.activePlans.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
              Your payment plan
            </h2>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {summary.activePlans.map((p) => (
                <li key={p.id} className="flex justify-between gap-4">
                  <span>
                    {money(p.paymentAmount)} {p.frequency} · {p.paymentsMade}/{p.numberOfPayments}{' '}
                    payments made
                  </span>
                  <span>{money(p.remainingBalance)} remaining</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pay CTA */}
        {balanceDue > 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
              Make a one-time payment
            </h2>
            {stripePromise ? (
              <Elements stripe={stripePromise}>
                <PaymentForm token={token} summary={summary} onPaid={load} />
              </Elements>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Online card payment is not currently available. Please contact the
                office that sent you this link to make a payment.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-6 text-center">
            <p className="text-emerald-800 dark:text-emerald-200 font-medium">
              No balance is currently due on this account.
            </p>
          </div>
        )}

        {/* Mini-Miranda — verbatim house text from the API (FDCPA §807(11)) */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center leading-relaxed">
          {summary.miniMiranda}
        </p>
      </div>
    </div>
  );
}
