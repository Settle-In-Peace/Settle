'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

interface PayoffScheduleRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

interface PayoffResult {
  months: number;
  totalInterest: number;
  totalPaid: number;
  schedule: PayoffScheduleRow[];
  error?: string;
}

function calculateDTI(income: number, debt: number): number {
  if (!income || income <= 0) return 0;
  return (debt / income) * 100;
}

function calculatePayoff(
  totalDebt: number,
  apr: number,
  monthlyPayment: number,
): PayoffResult {
  if (totalDebt <= 0 || monthlyPayment <= 0) {
    return { months: 0, totalInterest: 0, totalPaid: 0, schedule: [] };
  }

  const monthlyRate = apr / 100 / 12;
  const firstMonthInterest = totalDebt * monthlyRate;

  if (monthlyRate > 0 && monthlyPayment <= firstMonthInterest) {
    return {
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      schedule: [],
      error:
        'Monthly payment is too low to cover interest. Increase your payment to see a payoff timeline.',
    };
  }

  let balance = totalDebt;
  let totalInterestPaid = 0;
  let totalPaid = 0;
  let month = 0;
  const schedule: PayoffScheduleRow[] = [];
  const maxMonths = 1200; // 100 years safety cap

  while (balance > 0.01 && month < maxMonths) {
    month += 1;
    const interest = balance * monthlyRate;
    const principal = Math.min(monthlyPayment - interest, balance);
    const payment = principal + interest;
    const endingBalance = Math.max(balance - principal, 0);

    totalInterestPaid += interest;
    totalPaid += payment;

    schedule.push({
      month,
      payment: Number(payment.toFixed(2)),
      principal: Number(principal.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      balance: Number(endingBalance.toFixed(2)),
    });

    balance = endingBalance;
  }

  return {
    months: month,
    totalInterest: Number(totalInterestPaid.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    schedule,
  };
}

type DTICategory = {
  label: string;
  colorClass: string;
  bgClass: string;
  recommendation: string;
};

function getDTICategory(ratio: number): DTICategory {
  if (ratio < 36) {
    return {
      label: 'Healthy',
      colorClass: 'text-green-600 dark:text-green-400',
      bgClass: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900',
      recommendation:
        'Your debt-to-income ratio is in a healthy range. Lenders see you as lower risk, and you likely have room in your budget to save or invest.',
    };
  }
  if (ratio <= 42) {
    return {
      label: 'Manageable',
      colorClass: 'text-yellow-600 dark:text-yellow-400',
      bgClass: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-900',
      recommendation:
        'Your DTI is manageable, but you are approaching the threshold many lenders prefer. Consider paying down high-interest debt before taking on new credit.',
    };
  }
  if (ratio <= 49) {
    return {
      label: 'High',
      colorClass: 'text-orange-600 dark:text-orange-400',
      bgClass: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900',
      recommendation:
        'Your DTI is high and may limit your borrowing options or lead to higher rates. Focus on reducing debt and avoid new loans until your ratio improves.',
    };
  }
  return {
    label: 'Critical',
    colorClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900',
    recommendation:
      'Your DTI signals significant financial stress. Explore debt relief options such as debt settlement, credit counseling, or a structured payoff plan.',
  };
}

function InputField({
  id,
  label,
  prefix,
  suffix,
  value,
  onChange,
  type = 'number',
  min,
  step,
  placeholder,
}: {
  id: string;
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">{prefix}</span>
        )}
        <input
          id={id}
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          min={min}
          step={step}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow ${
            prefix ? 'pl-7' : 'pl-4'
          } ${suffix ? 'pr-10' : 'pr-4'} py-3`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-black text-black dark:text-white">{title}</h2>
      <p className="text-zinc-600 dark:text-zinc-400 mt-1">{description}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm p-6 lg:p-8">
      {children}
    </div>
  );
}

export default function CalculatorsClient() {
  // DTI state
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [monthlyDebtPayments, setMonthlyDebtPayments] = useState('');

  // Payoff state
  const [totalDebt, setTotalDebt] = useState('');
  const [apr, setApr] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [showAllMonths, setShowAllMonths] = useState(false);

  const dti = useMemo(
    () => calculateDTI(Number(monthlyIncome) || 0, Number(monthlyDebtPayments) || 0),
    [monthlyIncome, monthlyDebtPayments],
  );
  const dtiCategory = getDTICategory(dti);

  const payoff = useMemo(
    () => calculatePayoff(Number(totalDebt) || 0, Number(apr) || 0, Number(monthlyPayment) || 0),
    [totalDebt, apr, monthlyPayment],
  );

  const scheduleToShow = showAllMonths ? payoff.schedule : payoff.schedule.slice(0, 12);

  return (
    <section className="py-12 lg:py-16 px-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          {/* DTI Calculator */}
          <Card>
            <SectionTitle
              title="Debt-to-Income (DTI) Calculator"
              description="See what percentage of your monthly income goes toward debt."
            />

            <div className="space-y-4">
              <InputField
                id="monthly-income"
                label="Monthly gross income"
                prefix="$"
                value={monthlyIncome}
                onChange={setMonthlyIncome}
                min="0"
                step="100"
                placeholder="e.g. 5000"
              />
              <InputField
                id="monthly-debt-payments"
                label="Monthly debt payments"
                prefix="$"
                value={monthlyDebtPayments}
                onChange={setMonthlyDebtPayments}
                min="0"
                step="10"
                placeholder="e.g. 1500"
              />
            </div>

            <div className={`mt-6 p-5 rounded-xl border ${dtiCategory.bgClass}`}>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Your DTI</span>
                <span className={`text-3xl font-black ${dtiCategory.colorClass}`}>
                  {percent.format(dti / 100)}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">Status:</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold ${dtiCategory.bgClass} ${dtiCategory.colorClass}`}>
                  {dtiCategory.label}
                </span>
              </div>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {dtiCategory.recommendation}
              </p>
            </div>
          </Card>

          {/* Debt Payoff Calculator */}
          <Card>
            <SectionTitle
              title="Debt Payoff Calculator"
              description="Estimate how long it will take to pay off a debt and how much interest you will pay."
            />

            <div className="space-y-4">
              <InputField
                id="total-debt"
                label="Total debt"
                prefix="$"
                value={totalDebt}
                onChange={setTotalDebt}
                min="0"
                step="100"
                placeholder="e.g. 25000"
              />
              <InputField
                id="interest-rate"
                label="Annual interest rate (APR)"
                suffix="%"
                value={apr}
                onChange={setApr}
                min="0"
                step="0.01"
                placeholder="e.g. 18.99"
              />
              <InputField
                id="monthly-payment"
                label="Monthly payment"
                prefix="$"
                value={monthlyPayment}
                onChange={setMonthlyPayment}
                min="0"
                step="10"
                placeholder="e.g. 500"
              />
            </div>

            {payoff.error ? (
              <div className="mt-6 p-4 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm font-medium">
                {payoff.error}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Months</p>
                  <p className="text-xl font-black text-zinc-900 dark:text-white mt-1">
                    {payoff.months || '-'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Interest</p>
                  <p className="text-xl font-black text-zinc-900 dark:text-white mt-1">
                    {payoff.totalInterest ? currency.format(payoff.totalInterest) : '-'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Total paid</p>
                  <p className="text-xl font-black text-zinc-900 dark:text-white mt-1">
                    {payoff.totalPaid ? currency.format(payoff.totalPaid) : '-'}
                  </p>
                </div>
              </div>
            )}

            {!payoff.error && payoff.schedule.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Payoff schedule</h3>
                  <button
                    type="button"
                    onClick={() => setShowAllMonths((s) => !s)}
                    className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    {showAllMonths ? 'Show first 12 months' : `Show all ${payoff.months} months`}
                  </button>
                </div>

                <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-400">Month</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-400">Payment</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-400">Principal</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-400">Interest</th>
                        <th className="text-right px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-400">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {scheduleToShow.map((row) => (
                        <tr key={row.month} className="bg-white dark:bg-zinc-900">
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.month}</td>
                          <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                            {currency.format(row.payment)}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                            {currency.format(row.principal)}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                            {currency.format(row.interest)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-white">
                            {currency.format(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Conversion CTA — these pages get organic traffic but previously
            dead-ended with no path into the funnel. */}
        <div className="mt-10 rounded-2xl bg-blue-600 p-6 sm:p-8 text-white text-center">
          <h2 className="text-xl font-bold mb-2">See which relief options fit your numbers</h2>
          <p className="text-blue-100 mb-5 max-w-xl mx-auto">
            Take the free 2-minute assessment and get matched with debt relief providers
            based on your real debt, state, and income.
          </p>
          <Link
            href="/assessment"
            className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Start the free assessment
          </Link>
        </div>

        <p className="mt-8 text-xs text-center text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto">
          These calculators provide estimates for planning purposes only. Actual payoff timelines and
          interest costs may vary based on fees, compounding, and payment timing.
        </p>
      </div>
    </section>
  );
}
