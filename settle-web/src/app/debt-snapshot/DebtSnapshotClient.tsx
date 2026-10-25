'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://api.settleinpeace.com';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const DEBT_TYPES = [
  'Credit Card',
  'Personal Loan',
  'Medical Bill',
  'Collections',
  'Payday Loan',
  'Other',
] as const;

interface DebtRow {
  id: number;
  type: string;
  balance: string;
  apr: string;
  minPayment: string;
}

interface DebtResult {
  months: number;
  interest: number;
  stuck: boolean;
}

interface Snapshot {
  totalDebt: number;
  debtCount: number;
  monthlyMinimums: number;
  payoffMonths: number | null;
  payoffInterest: number | null;
  estSettlementCost: number;
  estSavings: number;
  estMonthlyDeposit: number;
}

// Settlement math (industry-typical, disclosed as estimate):
// debts settle ~50% of enrolled balance + ~25% program fee on enrolled debt,
// paid over a ~42-month program.
const SETTLE_RATE = 0.5;
const PROGRAM_FEE_RATE = 0.25;
const PROGRAM_MONTHS = 42;
const MAX_AMORTIZE_MONTHS = 600;

function amortize(balance: number, apr: number, monthly: number): DebtResult {
  if (balance <= 0) return { months: 0, interest: 0, stuck: false };
  const r = apr / 100 / 12;
  if (monthly <= balance * r) return { months: 0, interest: 0, stuck: true };

  let bal = balance;
  let interest = 0;
  let months = 0;
  while (bal > 0.005 && months < MAX_AMORTIZE_MONTHS) {
    const i = bal * r;
    interest += i;
    bal = bal + i - Math.min(monthly, bal + i);
    months++;
  }
  if (months >= MAX_AMORTIZE_MONTHS) return { months: 0, interest: 0, stuck: true };
  return { months, interest, stuck: false };
}

function calcSnapshot(rows: DebtRow[]): Snapshot | null {
  const debts = rows
    .map((d) => ({
      balance: parseFloat(d.balance) || 0,
      apr: parseFloat(d.apr) || 0,
      min: parseFloat(d.minPayment) || 0,
    }))
    .filter((d) => d.balance > 0);
  if (!debts.length) return null;

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const monthlyMinimums = debts.reduce((s, d) => s + d.min, 0);

  let months = 0;
  let interest = 0;
  let stuck = false;
  for (const d of debts) {
    const r = amortize(d.balance, d.apr, d.min || d.balance * 0.02);
    if (r.stuck) stuck = true;
    months = Math.max(months, r.months);
    interest += r.interest;
  }

  const estSettlementCost = totalDebt * SETTLE_RATE * (1 + PROGRAM_FEE_RATE);
  const estMonthlyDeposit = estSettlementCost / PROGRAM_MONTHS;
  const totalPaidViaMinimums = totalDebt + interest;
  const estSavings = Math.max(0, totalPaidViaMinimums - estSettlementCost);

  return {
    totalDebt,
    debtCount: debts.length,
    monthlyMinimums,
    payoffMonths: stuck ? null : months,
    payoffInterest: stuck ? null : interest,
    estSettlementCost,
    estSavings,
    estMonthlyDeposit,
  };
}

const fmtMonths = (m: number) =>
  m >= 24 ? `${Math.round(m / 12)} yrs ${m % 12 ? `${m % 12} mo` : ''}` : `${m} mo`;

let nextId = 3;

export default function DebtSnapshotClient() {
  const [rows, setRows] = useState<DebtRow[]>([
    { id: 1, type: 'Credit Card', balance: '', apr: '', minPayment: '' },
    { id: 2, type: 'Credit Card', balance: '', apr: '', minPayment: '' },
  ]);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  const snapshot = useMemo(() => calcSnapshot(rows), [rows]);

  const setRow = (id: number, patch: Partial<DebtRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      { id: nextId++, type: 'Credit Card', balance: '', apr: '', minPayment: '' },
    ]);

  const removeRow = (id: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  async function subscribe() {
    setSendState('sending');
    try {
      const res = await fetch(`${API_URL}/nurture/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          snapshot: snapshot ?? undefined,
        }),
      });
      setSendState(res.ok ? 'sent' : 'error');
    } catch {
      setSendState('error');
    }
  }

  const inputCls =
    'w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-base text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <section className="py-12 px-4">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10">
        {/* Inputs */}
        <div>
          <h2 className="text-2xl font-black text-black dark:text-white mb-2">
            Your debts
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Add each unsecured debt. Estimates only — nothing is sent or stored
            unless you email yourself the snapshot.
          </p>

          <div className="space-y-4">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <select
                    className={inputCls + ' max-w-[180px]'}
                    value={r.type}
                    onChange={(e) => setRow(r.id, { type: e.target.value })}
                    aria-label={`Debt ${i + 1} type`}
                  >
                    {DEBT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(r.id)}
                      className="text-sm text-zinc-400 hover:text-red-500"
                      aria-label={`Remove debt ${i + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      Balance
                    </span>
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      placeholder="8500"
                      value={r.balance}
                      onChange={(e) =>
                        setRow(r.id, {
                          balance: e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      APR %
                    </span>
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      placeholder="24.9"
                      value={r.apr}
                      onChange={(e) =>
                        setRow(r.id, {
                          apr: e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      Min/mo
                    </span>
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      placeholder="200"
                      value={r.minPayment}
                      onChange={(e) =>
                        setRow(r.id, {
                          minPayment: e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            + Add another debt
          </button>
        </div>

        {/* Results */}
        <div>
          <h2 className="text-2xl font-black text-black dark:text-white mb-2">
            Two futures, side by side
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Same debt. Very different endings.
          </p>

          {!snapshot ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center text-zinc-500">
              Enter at least one balance to see your snapshot.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-1">
                    Path A — Minimums
                  </p>
                  <p className="text-2xl font-black text-black dark:text-white">
                    {snapshot.payoffMonths
                      ? fmtMonths(snapshot.payoffMonths)
                      : 'Never'}
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    {snapshot.payoffInterest !== null
                      ? `${currency.format(snapshot.payoffInterest)} in interest`
                      : 'minimums don\u2019t cover interest'}
                  </p>
                </div>
                <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-1">
                    Path B — Settlement*
                  </p>
                  <p className="text-2xl font-black text-black dark:text-white">
                    ~{(PROGRAM_MONTHS / 12).toFixed(1)} yrs
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    ~{currency.format(snapshot.estMonthlyDeposit)}/mo program deposit
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-600 dark:text-zinc-400">Total debt</span>
                  <span className="font-bold text-black dark:text-white">
                    {currency.format(snapshot.totalDebt)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Cost via minimums
                  </span>
                  <span className="font-bold text-black dark:text-white">
                    {snapshot.payoffInterest !== null
                      ? currency.format(snapshot.totalDebt + snapshot.payoffInterest)
                      : `${currency.format(snapshot.totalDebt)}+`}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Est. settlement cost*
                  </span>
                  <span className="font-bold text-black dark:text-white">
                    {currency.format(snapshot.estSettlementCost)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Potential savings
                  </span>
                  <span className="font-black text-green-600 text-xl">
                    {currency.format(snapshot.estSavings)}
                  </span>
                </div>
              </div>

              {/* Assessment CTA — the savings number is the hook; this is the
                  next funnel step. */}
              <Link
                href="/assessment"
                className="block rounded-xl bg-blue-600 px-5 py-4 text-center font-bold text-white hover:bg-blue-700 transition-colors"
              >
                See your real options — free 2-minute assessment →
              </Link>

              {/* Email capture */}
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-5">
                {sendState === 'sent' ? (
                  <div className="text-center py-2">
                    <p className="font-bold text-black dark:text-white">
                      Check your inbox
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      Your snapshot is on its way, plus day 1 of the free 7-day
                      debt course tomorrow.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="font-bold text-black dark:text-white mb-1">
                      Email me this snapshot + free 7-day debt course
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                      One practical lesson a day — your rights, the math, collector
                      scripts. Unsubscribe anytime.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        className={inputCls + ' sm:w-36'}
                        placeholder="First name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                      <input
                        className={inputCls + ' flex-1'}
                        type="email"
                        required
                        placeholder="you@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <button
                        onClick={subscribe}
                        disabled={
                          sendState === 'sending' ||
                          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
                        }
                        className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {sendState === 'sending' ? 'Sending…' : 'Send my plan'}
                      </button>
                    </div>
                    {sendState === 'error' && (
                      <p className="text-sm text-red-600 mt-2">
                        Something went wrong — please try again.
                      </p>
                    )}
                  </>
                )}
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                *Settlement estimate assumes ~50% of enrolled balances plus a ~25%
                program fee over ~42 months — typical industry ranges, not a
                guarantee. Settlement can affect your credit and forgiven amounts
                may be taxable. Settle In Peace is a marketplace, not a lender or
                law firm.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
