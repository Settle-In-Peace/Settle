'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { clearAuth, getStoredUser } from '@/lib/authUtils';

const NAV = [
  {
    label: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/admin/crm', label: 'CRM Center', icon: 'M4 5h16v4H4zM4 12h10v7H4zM17 12h3v7h-3z' },
      { href: '/admin/sales', label: 'Sales CRM', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6' },
      { href: '/admin/sales-agents', label: 'Sales Team', icon: 'M8 10a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6M2 20c0-3.5 3-5 6-5s6 1.5 6 5M14 15c3.5 0 8 1.5 8 5' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/import', label: 'Import Leads', icon: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2' },
      { href: '/dashboard/dialer', label: 'Dialer', icon: 'M4 5c0 8 7 15 15 15l2-4-4-2-2 2c-3-1-6-4-7-7l2-2-2-4z' },
      { href: '/dashboard/org', label: 'My Org', icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h2M9 13h2M9 17h2M13 9h2M13 13h2M13 17h2' },
    ],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (u) setEmail((u as any)?.email || '');
  }, []);

  const logout = () => {
    clearAuth();
    router.push('/');
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="flex h-14 items-center gap-2.5 border-b border-zinc-800 px-4">
          <Link href="/admin" className="text-base"><Logo /></Link>
          <span className="rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">
            Admin
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                        active
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                      }`}
                    >
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={item.icon} />
                      </svg>
                      {item.label}
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-800 p-3">
          <Link
            href="/"
            className="mb-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-zinc-500 transition hover:bg-zinc-800/60 hover:text-zinc-300"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5m0 0l6-6m-6 6l6 6" />
            </svg>
            Back to site
          </Link>
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-300">
              {(email || 'A')[0].toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{email}</span>
            <button onClick={logout} className="text-xs text-zinc-600 transition hover:text-red-400" title="Log out">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-60 flex-1">{children}</main>
    </div>
  );
}
