'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthenticatedApi } from '../../lib/api';
import { getStoredUser, getStoredToken, clearAuth, isAuthenticated } from '../../lib/authUtils';
import ComplianceDisclosure from '../../components/ComplianceDisclosure';
import SalesCRMDashboard from '../sales/SalesCRMDashboard';

interface UserProfile {
  id: string;
  email: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: string;
}

// Non-customer roles belong on their own dashboards — mirrors redirectByRole in login
function dashboardForRole(role?: string): string | null {
  if (role === 'provider') return '/portal';
  if (role === 'admin') return '/admin';
  return null;
}

function getUserFromToken(): any | null {
  const token = getStoredToken();
  if (!token) return null;
  try {
    let base64 = token.split('.')[1];
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    base64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !isAuthenticated()) {
      router.push('/login');
      return;
    }

    // Fast path: check stored user and JWT token for role before hitting the API
    const stored = getStoredUser();
    const storedDest = dashboardForRole(stored?.role);
    if (storedDest) {
      router.push(storedDest);
      return;
    }
    if (stored?.role === 'sales') {
      setUser(stored);
      setLoading(false);
      return;
    }
    const tokenUser = getUserFromToken();
    const tokenDest = dashboardForRole(tokenUser?.role);
    if (tokenDest) {
      router.push(tokenDest);
      return;
    }
    if (tokenUser?.role === 'sales') {
      setUser(tokenUser);
      setLoading(false);
      return;
    }

    // Fallback: fetch profile from API to determine role
    const fetchProfile = async () => {
      try {
        const apiCall = getAuthenticatedApi();
        const response = await apiCall<UserProfile>('/auth/profile', { method: 'GET' });
        const dest = dashboardForRole(response.role);
        if (dest) {
          router.push(dest);
          return;
        }
        setUser(response);
      } catch (err) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router]);

  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-black">
        <div className="text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  // Sales users see the CRM dashboard — check user.role directly, no separate state
  if (user?.role === 'sales') {
    return <SalesCRMDashboard initialUser={user} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black dark:text-white">
            Welcome back, {user?.firstName || user?.email?.split('@')[0]}!
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Here's an overview of your account
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Info Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Account Information</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Email</p>
                <p className="text-black dark:text-white">{user?.email}</p>
              </div>
              {user?.firstName && (
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Name</p>
                  <p className="text-black dark:text-white">{user.firstName} {user.lastName}</p>
                </div>
              )}
              {user?.phone && (
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Phone</p>
                  <p className="text-black dark:text-white">{user.phone}</p>
                </div>
              )}
              {user?.role && (
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Role</p>
                  <p className="text-black dark:text-white capitalize">{user.role}</p>
                </div>
              )}
              {user?.createdAt && (
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Member Since</p>
                  <p className="text-black dark:text-white">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Quick Actions</h2>
            <div className="space-y-3">
              <a
                href="/debts"
                className="block w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-center"
              >
                Manage Debts
              </a>
              <a
                href="/settings"
                className="block w-full py-2 px-4 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-600 text-center"
              >
                Edit Profile
              </a>
              <a
                href="/settings"
                className="block w-full py-2 px-4 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-600 text-center"
              >
                Settings
              </a>
              <button
                onClick={handleLogout}
                className="block w-full py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Financial Peace Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Your Journey to Peace</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Debt Tracking</span>
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">Start Now</span>
              </div>
              <a
                href="/learn"
                className="flex items-center justify-between rounded-md -mx-2 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Financial Education</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">Explore →</span>
              </a>
              <a
                href="/settlement"
                className="flex items-center justify-between rounded-md -mx-2 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Debt Settlement</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">View Program →</span>
              </a>
              <a
                href="/coaching"
                className="flex items-center justify-between rounded-md -mx-2 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Financial Coaching</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">Open Coaching</span>
              </a>
            </div>
          </div>
        </div>

        {/* Recent Activity Section */}
        <div className="mt-8 bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Recent Activity</h2>
          <div className="text-zinc-600 dark:text-zinc-400">
            <p>No recent activity to display.</p>
          </div>
        </div>

        {/* Compliance disclosures */}
        <div className="mt-8">
          <ComplianceDisclosure />
        </div>
      </div>
    </div>
  );
}