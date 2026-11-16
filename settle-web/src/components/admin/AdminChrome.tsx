'use client';

/**
 * AdminChrome — shared chrome for the /admin workspace.
 *
 * AdminTopBar: logo + Admin badge on the left, signed-in email + logout on
 * the right. AdminWorkspaceTabs: the labeled tab strip that keeps the three
 * admin workspaces (Overview, CRM, Sales, Sales Team) one click apart.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearAuth } from '@/lib/authUtils';
import Logo from '@/components/Logo';

export function AdminTopBar({ email }: { email?: string }) {
  const router = useRouter();
  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };
  return (
    <div className="bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-xl shrink-0">
            <Logo />
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wider bg-violet-500/15 text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-sm text-zinc-400 hidden sm:block truncate">{email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-zinc-400 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export type AdminWorkspace = 'overview' | 'crm' | 'crm-overview' | 'questions' | 'sales' | 'team';

const WORKSPACES: { id: AdminWorkspace; label: string; href: string }[] = [
  { id: 'overview', label: 'Admin Overview', href: '/admin' },
  { id: 'crm', label: 'CRM Center', href: '/admin/crm' },
  { id: 'crm-overview', label: 'CRM Overview', href: '/admin/crm-overview' },
  { id: 'questions', label: 'Q&A Review', href: '/admin/questions' },
  { id: 'sales', label: 'Sales', href: '/admin/sales' },
  { id: 'team', label: 'Sales Team', href: '/admin/sales-agents' },
];

export function AdminWorkspaceTabs({ active }: { active: AdminWorkspace }) {
  return (
    <nav
      aria-label="Admin workspaces"
      className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-1"
    >
      {WORKSPACES.map((w) => (
        <Link
          key={w.id}
          href={w.href}
          aria-current={active === w.id ? 'page' : undefined}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            active === w.id
              ? 'bg-emerald-600 text-white'
              : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
          }`}
        >
          {w.label}
        </Link>
      ))}
    </nav>
  );
}
