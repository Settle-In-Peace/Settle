'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { isAuthenticated, getStoredUser, clearAuth } from '../lib/authUtils';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const authenticated = mounted && isAuthenticated();
  const user = mounted ? getStoredUser() : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Hydration: mark mounted after first client render
  useEffect(() => { setMounted(true); }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const handleLogout = () => {
    clearAuth();
    setMenuOpen(false);
    router.push('/');
  };

  // Nav links — marketplace + key account links when authenticated
  const navItems = authenticated
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/debts', label: 'My Debts' },
        { href: '/assessment', label: 'Free Assessment' },
        { href: '/compare', label: 'Compare Providers' },
      ]
    : [
        { href: '/assessment', label: 'Free Assessment' },
        { href: '/calculators', label: 'Calculators' },
        { href: '/compare', label: 'Compare Providers' },
        { href: '/providers', label: 'For Providers' },
      ];

  // Additional account items for dropdown only
  const dropdownItems = [
    { href: '/coaching', label: 'Coaching' },
    { href: '/settings', label: 'Settings' },
  ];

  // Role-gated items
  const roleItems: { href: string; label: string }[] = [];
  if (authenticated && user) {
    if (user.role === 'provider') roleItems.push({ href: '/portal', label: 'Provider Portal' });
    if (user.role === 'sales') {
      roleItems.push({ href: '/sales', label: 'Sales CRM' });
      roleItems.push({ href: '/leads', label: 'Leads' });
      roleItems.push({ href: '/collections', label: 'Collections' });
    }
    if (user.role === 'admin') {
      roleItems.push({ href: '/admin', label: 'Admin' });
      roleItems.push({ href: '/admin/sales-agents', label: 'Sales Team' });
      roleItems.push({ href: '/admin/sales', label: 'Sales CRM' });
      roleItems.push({ href: '/crm', label: 'CRM Center' });
      roleItems.push({ href: '/leads', label: 'Leads' });
      roleItems.push({ href: '/collections', label: 'Collections' });
    }
  }

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo + marketplace links */}
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-black dark:text-white mr-8 flex-shrink-0">
              Settle<span className="text-blue-600">InPeace</span>
            </Link>
            <div className="hidden sm:flex sm:space-x-6">
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'border-blue-500 text-black dark:text-white'
                      : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {item.href === '/assessment' ? (
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{item.label}</span>
                  ) : item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right side: auth controls */}
          <div className="flex items-center gap-4">
            {mounted && (
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {resolvedTheme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m0 13.5V21m7.5-9H19.5M4.5 12H3m15.364-6.364-1.591 1.591M6.227 17.773l-1.591 1.591M18.364 17.773l-1.591-1.591M6.227 6.227 4.636 4.636M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75 9.75 9.75 0 0 1 8.25 6c0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25 9.75 9.75 0 0 0 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                  </svg>
                )}
              </button>
            )}

            {/* Role-gated links (provider/admin) */}
            {authenticated && roleItems.length > 0 && (
              <div className="hidden sm:flex sm:items-center sm:space-x-4">
                {roleItems.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            {/* Unauthenticated: Login + Register + CTA */}
            {!authenticated && (
              <div className="hidden sm:flex sm:items-center sm:space-x-4">
                <Link href="/login" className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                  Login
                </Link>
                <Link href="/register" className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                  Register
                </Link>
                <Link
                  href="/assessment"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Get Free Help →
                </Link>
              </div>
            )}

            {/* Authenticated: user dropdown */}
            {authenticated && user && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {(user.firstName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400 hidden sm:block max-w-[140px] truncate">
                    {user.firstName || user.email}
                  </span>
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 py-2 z-50">
                    {/* User info header */}
                    <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-700 mb-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
                    </div>

                    {/* Dropdown-only account links */}
                    {dropdownItems.map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block px-4 py-2 text-sm transition-colors ${
                          isActive(item.href)
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}

                    {/* Role-gated links in dropdown */}
                    {roleItems.map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block px-4 py-2 text-sm transition-colors ${
                          isActive(item.href)
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}

                    {/* Logout */}
                    <div className="border-t border-zinc-100 dark:border-zinc-700 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}