'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthenticatedApi } from '../../lib/api';
import { isAuthenticated } from '../../lib/authUtils';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';

interface Debt {
  id: string;
  creditor: string;
  balance: number;
  originalBalance?: number;
  interestRate?: number;
  dueDate?: string;
  type: string;
  status: string;
  notes?: string;
  createdAt: string;
}

interface DebtSummary {
  totalDebt: number;
  totalOriginal: number;
  totalSaved: number;
  debtCount: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

export default function DebtsPage() {
  const router = useRouter();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [summary, setSummary] = useState<DebtSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newDebt, setNewDebt] = useState({
    creditor: '',
    balance: '',
    interestRate: '',
    dueDate: '',
    type: 'credit_card',
    notes: '',
  });

  const getApiCall = () => getAuthenticatedApi();

  const refreshDebts = async () => {
    const apiCall = getApiCall();
    const [debtsData, summaryData] = await Promise.all([
      apiCall<Debt[]>('/debts', { method: 'GET' }),
      apiCall<DebtSummary>('/debts/summary', { method: 'GET' }),
    ]);
    setDebts(debtsData);
    setSummary(summaryData);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && !isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchDebts = async () => {
      try {
        const apiCall = getAuthenticatedApi();

        const [debtsData, summaryData] = await Promise.all([
          apiCall<Debt[]>('/debts', { method: 'GET' }),
          apiCall<DebtSummary>('/debts/summary', { method: 'GET' }),
        ]);

        setDebts(debtsData);
        setSummary(summaryData);
      } catch (err) {
        setError('Failed to load debts');
      } finally {
        setLoading(false);
      }
    };

    fetchDebts();
  }, [router]);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiCall = getApiCall();
      await apiCall<void>('/debts', {
        method: 'POST',
        body: JSON.stringify({
          ...newDebt,
          balance: parseFloat(newDebt.balance),
          interestRate: newDebt.interestRate ? parseFloat(newDebt.interestRate) : undefined,
        }),
      });
      await refreshDebts();
      setShowAddForm(false);
      setNewDebt({ creditor: '', balance: '', interestRate: '', dueDate: '', type: 'credit_card', notes: '' });
    } catch {
      setError('Failed to add debt');
    }
  };

  const handleEditDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebt) return;
    try {
      const apiCall = getApiCall();
      await apiCall<void>(`/debts/${editingDebt.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          creditor: editingDebt.creditor,
          balance: Number(editingDebt.balance),
          interestRate: editingDebt.interestRate ? Number(editingDebt.interestRate) : undefined,
          dueDate: editingDebt.dueDate ? new Date(editingDebt.dueDate).toISOString().split('T')[0] : undefined,
          type: editingDebt.type,
          notes: editingDebt.notes,
        }),
      });
      await refreshDebts();
      setEditingDebt(null);
    } catch {
      setError('Failed to update debt');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const apiCall = getApiCall();
      await apiCall<void>(`/debts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await refreshDebts();
    } catch {
      setError('Failed to update status');
    }
  };

  const handleDeleteDebt = async (id: string) => {
    try {
      const apiCall = getApiCall();
      await apiCall<void>(`/debts/${id}`, { method: 'DELETE' });
      await refreshDebts();
      setDeletingId(null);
    } catch {
      setError('Failed to delete debt');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black dark:text-white">Debt Management</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Track and manage your debts to achieve financial peace
          </p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Debt</h3>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                ${summary.totalDebt.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Original Balance</h3>
              <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">
                ${summary.totalOriginal.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Saved</h3>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${summary.totalSaved.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Debts</h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {summary.debtCount}
              </p>
            </div>
          </div>
        )}

        {/* Add Debt Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {showAddForm ? 'Cancel' : '+ Add Debt'}
          </button>
        </div>

        {/* Add Debt Form */}
        {showAddForm && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Add New Debt</h2>
            <form onSubmit={handleAddDebt} className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Creditor
                </label>
                <input
                  type="text"
                  value={newDebt.creditor}
                  onChange={(e) => setNewDebt({ ...newDebt, creditor: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newDebt.balance}
                  onChange={(e) => setNewDebt({ ...newDebt, balance: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newDebt.interestRate}
                  onChange={(e) => setNewDebt({ ...newDebt, interestRate: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Due Date
                </label>
                <input
                  type="date"
                  value={newDebt.dueDate}
                  onChange={(e) => setNewDebt({ ...newDebt, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Type
                </label>
                <select
                  value={newDebt.type}
                  onChange={(e) => setNewDebt({ ...newDebt, type: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
                >
                  <option value="credit_card">Credit Card</option>
                  <option value="personal_loan">Personal Loan</option>
                  <option value="medical">Medical</option>
                  <option value="student_loan">Student Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Notes
                </label>
                <textarea
                  value={newDebt.notes}
                  onChange={(e) => setNewDebt({ ...newDebt, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Add Debt
              </button>
            </form>
          </div>
        )}

        {/* Debts List */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Your Debts</h2>
            {debts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">No debts added yet.</p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  + Add Your First Debt
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {debts.map((debt) => (
                  <div key={debt.id} className="border-b border-zinc-200 dark:border-zinc-700 pb-4 last:border-0">
                    {editingDebt?.id === debt.id ? (
                      <form onSubmit={handleEditDebt} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Creditor</label>
                            <input
                              type="text"
                              value={editingDebt.creditor}
                              onChange={(e) => setEditingDebt({ ...editingDebt, creditor: e.target.value })}
                              required
                              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white text-base"
                            />
                          </div>
                          <div>
                            <label className="block mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Balance ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editingDebt.balance}
                              onChange={(e) => setEditingDebt({ ...editingDebt, balance: Number(e.target.value) })}
                              required
                              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white text-base"
                            />
                          </div>
                          <div>
                            <label className="block mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Interest Rate (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editingDebt.interestRate || ''}
                              onChange={(e) => setEditingDebt({ ...editingDebt, interestRate: e.target.value ? Number(e.target.value) : undefined })}
                              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white text-base"
                            />
                          </div>
                          <div>
                            <label className="block mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Type</label>
                            <select
                              value={editingDebt.type}
                              onChange={(e) => setEditingDebt({ ...editingDebt, type: e.target.value })}
                              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white text-base"
                            >
                              <option value="credit_card">Credit Card</option>
                              <option value="personal_loan">Personal Loan</option>
                              <option value="medical">Medical</option>
                              <option value="student_loan">Student Loan</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Notes</label>
                          <textarea
                            value={editingDebt.notes || ''}
                            onChange={(e) => setEditingDebt({ ...editingDebt, notes: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800 dark:text-white text-base"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                            Save Changes
                          </button>
                          <button type="button" onClick={() => setEditingDebt(null)} className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 text-sm">
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : deletingId === debt.id ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-red-600 dark:text-red-400">Delete this debt? This cannot be undone.</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleDeleteDebt(debt.id)} className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                            Delete
                          </button>
                          <button onClick={() => setDeletingId(null)} className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 text-sm">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-black dark:text-white">{debt.creditor}</h3>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 capitalize">{debt.type.replace('_', ' ')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-red-600 dark:text-red-400">
                              ${Number(debt.balance).toLocaleString()}
                            </p>
                            <select
                              value={debt.status}
                              onChange={(e) => handleStatusChange(debt.id, e.target.value)}
                              className={`text-base font-medium rounded-full px-2 py-1 border-0 cursor-pointer capitalize ${
                                debt.status === 'active' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                                debt.status === 'in_progress' ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' :
                                debt.status === 'settled' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                                'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                              }`}
                            >
                              <option value="active">Active</option>
                              <option value="in_progress">In Progress</option>
                              <option value="settled">Settled</option>
                              <option value="default">Default</option>
                            </select>
                          </div>
                        </div>
                        {debt.interestRate && (
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                            Interest Rate: {debt.interestRate}%
                          </p>
                        )}
                        {debt.dueDate && (
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Due Date: {new Date(debt.dueDate).toLocaleDateString()}
                          </p>
                        )}
                        {debt.notes && (
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">{debt.notes}</p>
                        )}
                        <div className="flex gap-3 mt-3">
                          <button
                            onClick={() => setEditingDebt({ ...debt })}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingId(debt.id)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}