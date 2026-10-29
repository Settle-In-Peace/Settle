// Single source of truth for the backend API base URL.
// NEXT_PUBLIC_API_URL is inlined at build time (set by scripts/cf-build.sh for
// prod, .env.local for dev). The fallback must be the production URL — a
// localhost default gets baked into prod bundles and breaks every client fetch.
const raw = (process.env.NEXT_PUBLIC_API_URL || 'https://api.settleinpeace.com').replace(/\/+$/, '');

// Last-ditch guard: if a localhost URL got baked into a bundle being served
// from a real domain, point at prod instead of fetching an unrunnable origin.
const isLocalPage = typeof window === 'undefined'
  || /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname)
  || window.location.hostname.endsWith('.local');
const looksLocal = /^https?:\/\/(localhost|127\.)/.test(raw);

export const API_URL = (looksLocal && !isLocalPage) ? 'https://api.settleinpeace.com' : raw;
