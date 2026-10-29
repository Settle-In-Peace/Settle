// Single source of truth for the backend API base URL.
// NEXT_PUBLIC_API_URL is inlined at build time (set by scripts/cf-build.sh for
// prod, .env.local for dev). The fallback must be the production URL — a
// localhost default gets baked into prod bundles and breaks every client fetch.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.settleinpeace.com').replace(/\/+$/, '');
