'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createBillingPortalSession,
  createBudget,
  createCoachingCheckoutSession,
  createGoal,
  deleteBudget,
  deleteGoal,
  getCoachingDashboard,
  type Budget,
  type BudgetExpense,
  type CoachingDashboard,
  type Goal,
  updateBudget,
  updateGoalProgress,
} from '../../lib/api';
import { isAuthenticated } from '../../lib/authUtils';
import { getToken } from '../../lib/auth';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const inputClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';
const cardClass = 'rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900';

type ExpenseForm = { name: string; amount: string; category: string };

const emptyExpense = (): ExpenseForm => ({ name: '', amount: '', category: 'other' });

function expenseTotal(expenses: BudgetExpense[]) {
  return expenses.reduce((total, expense) => total + Number(expense.amount), 0);
}

export default function CoachingPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<CoachingDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetIncome, setBudgetIncome] = useState('');
  const [budgetExpenses, setBudgetExpenses] = useState<ExpenseForm[]>([emptyExpense()]);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalType, setGoalType] = useState<Goal['type']>('savings');
  const [progressValues, setProgressValues] = useState<Record<string, string>>({});

  const loadDashboard = async () => {
    try {
      setError('');
      const data = await getCoachingDashboard();
      setDashboard(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your coaching dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    void loadDashboard();
  }, [router]);

  const subscribeToCoaching = async () => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const session = await createCoachingCheckoutSession(token, window.location.origin);
      if (!session.url) throw new Error('Stripe Checkout did not return a redirect URL.');
      window.location.assign(session.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start coaching checkout.');
      setSubmitting(false);
    }
  };

  const manageBilling = async () => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const session = await createBillingPortalSession(token);
      if (!session.url) throw new Error('Stripe billing portal did not return a redirect URL.');
      window.location.assign(session.url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : 'Unable to open the billing portal.');
      setSubmitting(false);
    }
  };

  const resetBudgetForm = () => {
    setBudgetIncome('');
    setBudgetExpenses([emptyExpense()]);
    setEditingBudget(null);
    setShowBudgetForm(false);
  };

  const saveBudget = async (event: React.FormEvent) => {
    event.preventDefault();
    const monthlyIncome = Number(budgetIncome);
    const expenses = budgetExpenses
      .filter((expense) => expense.name.trim() || expense.amount)
      .map((expense) => ({
        name: expense.name.trim(),
        amount: Number(expense.amount),
        category: expense.category,
        recurring: true,
      }));

    if (!Number.isFinite(monthlyIncome) || monthlyIncome < 0 || expenses.some((expense) => !expense.name || !Number.isFinite(expense.amount) || expense.amount < 0)) {
      setError('Enter a monthly income and a name and non-negative amount for every expense.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const data = { monthlyIncome, expenses };
      if (editingBudget) {
        await updateBudget(editingBudget.id, data);
      } else {
        await createBudget(data);
      }
      resetBudgetForm();
      await loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this budget.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEditingBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setBudgetIncome(String(budget.monthlyIncome));
    setBudgetExpenses(
      budget.expenses.length
        ? budget.expenses.map((expense) => ({ name: expense.name, amount: String(expense.amount), category: expense.category }))
        : [emptyExpense()],
    );
    setShowBudgetForm(true);
  };

  const saveGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetAmount = Number(goalTarget);
    if (!goalTitle.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      setError('Enter a goal name and a target amount greater than zero.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await createGoal({
        title: goalTitle.trim(),
        targetAmount,
        type: goalType,
        deadline: goalDeadline || undefined,
      });
      setGoalTitle('');
      setGoalTarget('');
      setGoalDeadline('');
      setGoalType('savings');
      setShowGoalForm(false);
      await loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to create this goal.');
    } finally {
      setSubmitting(false);
    }
  };

  const saveGoalProgress = async (goal: Goal) => {
    const currentAmount = Number(progressValues[goal.id] ?? goal.currentAmount);
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setError('Enter a non-negative progress amount.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await updateGoalProgress(goal.id, currentAmount);
      setProgressValues((current) => ({ ...current, [goal.id]: String(currentAmount) }));
      await loadDashboard();
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : 'Unable to update goal progress.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeBudget = async (id: string) => {
    if (!window.confirm('Delete this budget?')) return;
    try {
      setSubmitting(true);
      setError('');
      await deleteBudget(id);
      await loadDashboard();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this budget.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeGoal = async (id: string) => {
    if (!window.confirm('Delete this goal?')) return;
    try {
      setSubmitting(true);
      setError('');
      await deleteGoal(id);
      await loadDashboard();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this goal.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-black dark:text-zinc-400">Loading your coaching dashboard...</main>;
  }

  const summary = dashboard?.summary;
  const budgets = dashboard?.budgets ?? [];
  const goals = dashboard?.goals ?? [];

  return (
    <main className="min-h-screen bg-zinc-50 py-8 dark:bg-black">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Financial Coaching</p>
            <h1 className="text-3xl font-bold text-zinc-950 dark:text-white">Build your path to financial peace</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">Track your monthly plan, celebrate progress, and stay focused on your goals.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm dark:bg-blue-950/50">
              <span className="text-zinc-600 dark:text-zinc-400">Coaching status: </span>
              <span className="font-semibold capitalize text-blue-700 dark:text-blue-300">{dashboard?.subscription.status ?? 'inactive'}</span>
            </div>
            {['active', 'trialing'].includes(dashboard?.subscription.status ?? 'inactive') && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void manageBilling()}
                className="rounded-lg border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Manage subscription
              </button>
            )}
          </div>
        </header>

        {error && <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">{error}</div>}

        {!['active', 'trialing'].includes(dashboard?.subscription.status ?? 'inactive') && (
          <section className={`${cardClass} mb-8 border-blue-200 dark:border-blue-800`} aria-label="Coaching subscription">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-950 dark:text-white">Monthly Coaching Subscription</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Get ongoing guidance, budgeting tools, and goal tracking for $49/month. Start with a 30-day free trial.</p>
              </div>
              <button type="button" disabled={submitting} onClick={() => void subscribeToCoaching()} className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? 'Redirecting...' : 'Subscribe to Coaching'}
              </button>
            </div>
          </section>
        )}

        <section aria-label="Coaching overview" className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Monthly income', currency.format(Number(summary?.totalMonthlyIncome ?? 0))],
            ['Monthly expenses', currency.format(Number(summary?.totalMonthlyExpenses ?? 0))],
            ['Net cash flow', currency.format(Number(summary?.netMonthly ?? 0))],
            ['Active budgets', String(budgets.length)],
            ['Goals', String(summary?.totalGoals ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className={cardClass}>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-950 dark:text-white">{value}</p>
            </div>
          ))}
        </section>

        <section className={`${cardClass} mb-8`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-xl font-bold text-zinc-950 dark:text-white">Monthly budgets</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Create a plan for your income and everyday expenses.</p></div>
            <button type="button" onClick={() => { resetBudgetForm(); setShowBudgetForm(true); }} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">Add budget</button>
          </div>

          {showBudgetForm && <form onSubmit={saveBudget} className="mt-6 rounded-lg border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
            <h3 className="mb-4 font-semibold text-zinc-950 dark:text-white">{editingBudget ? 'Edit budget' : 'New budget'}</h3>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Monthly income<input required min="0" step="0.01" type="number" value={budgetIncome} onChange={(event) => setBudgetIncome(event.target.value)} className={`${inputClass} mt-1`} /></label>
            <div className="mt-4 space-y-3"><p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Expenses</p>
              {budgetExpenses.map((expense, index) => <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_10rem_auto]">
                <input required placeholder="Expense name" value={expense.name} onChange={(event) => setBudgetExpenses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className={inputClass} />
                <input required min="0" step="0.01" type="number" placeholder="Amount" value={expense.amount} onChange={(event) => setBudgetExpenses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} className={inputClass} />
                <select value={expense.category} onChange={(event) => setBudgetExpenses((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))} className={inputClass}><option value="housing">Housing</option><option value="food">Food</option><option value="transport">Transport</option><option value="utilities">Utilities</option><option value="insurance">Insurance</option><option value="entertainment">Entertainment</option><option value="other">Other</option></select>
                <button type="button" aria-label="Remove expense" disabled={budgetExpenses.length === 1} onClick={() => setBudgetExpenses((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400">Remove</button>
              </div>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setBudgetExpenses((items) => [...items, emptyExpense()])} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">Add expense</button><button disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Save budget'}</button><button type="button" onClick={resetBudgetForm} className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">Cancel</button></div>
          </form>}

          <div className="mt-6 space-y-4">{budgets.length === 0 ? <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">No budgets yet. Add one to understand your monthly cash flow.</p> : budgets.map((budget, index) => { const expenses = expenseTotal(budget.expenses); const remaining = Number(budget.monthlyIncome) - expenses; return <article key={budget.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-zinc-950 dark:text-white">Budget {budgets.length - index}</h3><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Income {currency.format(Number(budget.monthlyIncome))} − expenses {currency.format(expenses)} = <span className={remaining < 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'font-semibold text-green-600 dark:text-green-400'}>{currency.format(remaining)} remaining</span></p></div><div className="flex gap-3"><button type="button" onClick={() => startEditingBudget(budget)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400">Edit</button><button type="button" disabled={submitting} onClick={() => void removeBudget(budget.id)} className="text-sm font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400">Delete</button></div></div>{budget.expenses.length > 0 && <ul className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">{budget.expenses.map((expense) => <li key={expense.id ?? `${expense.name}-${expense.category}`} className="flex justify-between rounded bg-zinc-50 px-3 py-2 dark:bg-zinc-950"><span>{expense.name} <span className="text-zinc-400">({expense.category})</span></span><span>{currency.format(Number(expense.amount))}</span></li>)}</ul>}</article>; })}</div>
        </section>

        <section className={cardClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-zinc-950 dark:text-white">Financial goals</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Set a target and record your progress as you go.</p></div><button type="button" onClick={() => setShowGoalForm(true)} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">Add goal</button></div>
          {showGoalForm && <form onSubmit={saveGoal} className="mt-6 grid gap-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-2 dark:border-blue-900 dark:bg-blue-950/20"><label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Goal name<input required value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} className={`${inputClass} mt-1`} placeholder="Build an emergency fund" /></label><label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Target amount<input required min="0.01" step="0.01" type="number" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} className={`${inputClass} mt-1`} /></label><label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Goal type<select value={goalType} onChange={(event) => setGoalType(event.target.value as Goal['type'])} className={`${inputClass} mt-1`}><option value="savings">Savings</option><option value="emergency_fund">Emergency fund</option><option value="debt_payoff">Debt payoff</option></select></label><label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Target date <span className="font-normal">(optional)</span><input type="date" value={goalDeadline} onChange={(event) => setGoalDeadline(event.target.value)} className={`${inputClass} mt-1`} /></label><div className="flex gap-3 sm:col-span-2"><button disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Save goal'}</button><button type="button" onClick={() => setShowGoalForm(false)} className="px-3 py-2 text-sm font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">Cancel</button></div></form>}
          <div className="mt-6 space-y-4">{goals.length === 0 ? <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">No goals yet. A clear target is a great next step.</p> : goals.map((goal) => { const progress = Math.min(100, Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100)); return <article key={goal.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-zinc-950 dark:text-white">{goal.title} {goal.completed && <span className="ml-2 text-sm text-green-600 dark:text-green-400">Complete</span>}</h3><p className="mt-1 text-sm capitalize text-zinc-600 dark:text-zinc-400">{goal.type.replace('_', ' ')}{goal.deadline ? ` · Target date ${new Date(goal.deadline).toLocaleDateString()}` : ''}</p></div><button type="button" disabled={submitting} onClick={() => void removeGoal(goal.id)} className="text-sm font-semibold text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400">Delete</button></div><div className="mt-4"><div className="mb-2 flex justify-between text-sm"><span className="text-zinc-600 dark:text-zinc-400">{currency.format(Number(goal.currentAmount))} of {currency.format(Number(goal.targetAmount))}</span><span className="font-semibold text-zinc-950 dark:text-white">{progress}%</span></div><div className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor={`progress-${goal.id}`}>Current amount for {goal.title}</label><input id={`progress-${goal.id}`} type="number" min="0" step="0.01" value={progressValues[goal.id] ?? String(goal.currentAmount)} onChange={(event) => setProgressValues((current) => ({ ...current, [goal.id]: event.target.value }))} className={`${inputClass} sm:max-w-48`} /><button type="button" disabled={submitting} onClick={() => void saveGoalProgress(goal)} className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-950">Update progress</button></div></article>; })}</div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2"><Link href="/calculators" className="rounded-xl border border-blue-200 bg-blue-50 p-5 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:hover:bg-blue-950"><h2 className="font-bold text-zinc-950 dark:text-white">Use debt calculators</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Estimate your payoff timeline and debt-to-income ratio.</p></Link><Link href="/debts" className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"><h2 className="font-bold text-zinc-950 dark:text-white">Manage your debts</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Keep your debt details organized alongside your coaching plan.</p></Link></section>
      </div>
    </main>
  );
}
