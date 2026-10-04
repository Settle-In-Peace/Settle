'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredToken, getStoredUser } from '@/lib/authUtils';
import PasswordInput from '../../../components/PasswordInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4025';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: string;
  createdAt?: string;
}

export default function SalesTeamPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'sales',
  });

  useEffect(() => {
    const token = getStoredToken();
    const parsed = getStoredUser();
    if (!token || !parsed || parsed.role !== 'admin') {
      router.push('/login');
      return;
    }
    setUser(parsed);
    loadUsers(token);
  }, [router]);

  const loadUsers = async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/users?role=sales`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load sales team');
      setUsers(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create user');
      }
      setSuccess('User created successfully');
      setForm({ email: '', password: '', firstName: '', lastName: '', phone: '', role: 'sales' });
      setIsAdding(false);
      await loadUsers(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, role: string) => {
    const token = getStoredToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Failed to update user');
      setEditingId(null);
      await loadUsers(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    const token = getStoredToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete user');
      await loadUsers(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Sales Team Management</h1>
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            + Add Sales Agent
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg">{success}</div>}

        {isAdding && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-white">Add New User</h2>
            <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
              <input
                type="email"
                required
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
              />
              <PasswordInput
                required
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
              />
              <input
                type="text"
                placeholder="First name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
              />
              <input
                type="text"
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
              />
              <input
                type="text"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
              >
                <option value="sales">Sales</option>
                <option value="admin">Admin</option>
                <option value="customer">Customer</option>
                <option value="provider">Provider</option>
              </select>
              <div className="sm:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-zinc-600 dark:text-zinc-300 hover:underline text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Role</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100 font-medium">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{u.email}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{u.phone || '—'}</td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {editingId === u.id ? (
                      <select
                        defaultValue={u.role}
                        onBlur={(e) => handleUpdate(u.id, e.target.value)}
                        onChange={(e) => handleUpdate(u.id, e.target.value)}
                        className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
                        disabled={saving}
                      >
                        <option value="sales">Sales</option>
                        <option value="admin">Admin</option>
                        <option value="customer">Customer</option>
                        <option value="provider">Provider</option>
                      </select>
                    ) : (
                      <span className="capitalize">{u.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setEditingId(u.id)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Edit Role
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                    No sales agents found. Add one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
