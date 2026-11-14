// Session storage + token refresh — credentials live in the OS keychain
// (expo-secure-store) with an AsyncStorage fallback for binaries built
// before the native module was linked (OTA safety — same convention as
// bargain-mobile / clipstakes-mobile and services/passkey.ts).
// The cached user profile is plain AsyncStorage — it is not a credential.
//
// This module deliberately imports nothing from ./api or ./auth so both can
// depend on it without an import cycle.
//
// settle-api auth flow (/auth):
//   POST /login | /register | /verify-otp → {accessToken(1h), refreshToken(rotating), user}
//   POST /refresh {refreshToken} → {accessToken, refreshToken, expiresIn} — the
//     server revokes the presented refresh token and issues a new pair, so BOTH
//     tokens must be re-stored on every refresh.
//   POST /logout {refreshToken} → revokes the server-side session.
//   A 401/403 from /refresh means revoked/expired — the session is really over.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://api.settleinpeace.com';

const TOKEN_KEY = '@settle_token';
const REFRESH_KEY = '@settle_refresh';
const USER_KEY = '@settle_user';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role?: string;
  phone?: string;
  createdAt?: string;
}

// ---- storage --------------------------------------------------------------

type SecureStoreModule = typeof import('expo-secure-store');
let secureStoreMod: SecureStoreModule | null | undefined;

function secureStore(): SecureStoreModule | null {
  if (secureStoreMod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy-require keeps OTA updates bootable on binaries built without the native module
      secureStoreMod = require('expo-secure-store') as SecureStoreModule;
    } catch {
      secureStoreMod = null;
    }
  }
  return secureStoreMod ?? null;
}

async function secureSet(key: string, value: string): Promise<void> {
  const S = secureStore();
  if (S) {
    try {
      await S.setItemAsync(key, value);
      // Drop any leftover plaintext copy written by an older version.
      await AsyncStorage.removeItem(key).catch(() => {});
      return;
    } catch {
      /* store threw — fall through to AsyncStorage */
    }
  }
  await AsyncStorage.setItem(key, value);
}

async function secureGet(key: string): Promise<string | null> {
  const S = secureStore();
  if (S) {
    try {
      const v = await S.getItemAsync(key);
      if (v !== null) return v;
      // fall through — may have been written by the AsyncStorage fallback
    } catch {
      /* native module threw — use AsyncStorage */
    }
  }
  return AsyncStorage.getItem(key);
}

async function secureDel(key: string): Promise<void> {
  const S = secureStore();
  if (S) {
    try {
      await S.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  }
  await AsyncStorage.removeItem(key).catch(() => {});
}

// ---- jwt ------------------------------------------------------------------

/** Decode the exp claim — tokens are self-issued {sub,exp} JWTs. */
export function isJwtExpired(token: string, skewMs = 30000): boolean {
  try {
    const payload = JSON.parse(
      decodeURIComponent(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    );
    return !payload.exp || payload.exp * 1000 < Date.now() + skewMs;
  } catch {
    return true;
  }
}

// ---- token + profile accessors --------------------------------------------

export async function setToken(token: string): Promise<void> {
  await secureSet(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return secureGet(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return secureGet(REFRESH_KEY);
}

export async function storeUser(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

/** Persist the full auth response — access token, rotating refresh token, profile. */
export async function storeSession(data: {
  accessToken?: string;
  refreshToken?: string;
  user?: User;
}): Promise<void> {
  if (!data.accessToken) return;
  await secureSet(TOKEN_KEY, data.accessToken);
  if (data.refreshToken) await secureSet(REFRESH_KEY, data.refreshToken);
  if (data.user) await storeUser(data.user);
}

/** Clear everything — access + refresh + cached profile. */
export async function removeToken(): Promise<void> {
  await secureDel(TOKEN_KEY);
  await secureDel(REFRESH_KEY);
  await AsyncStorage.removeItem(USER_KEY).catch(() => {});
}

// ---- refresh --------------------------------------------------------------

let refreshing: Promise<string | null> | null = null;

/**
 * Swap the refresh token for a new pair. Single-flight: concurrent callers
 * share one request — critical because the server rotates (revokes) the
 * presented refresh token, so a second concurrent call would 401.
 * Returns null when the refresh token is absent/expired/revoked (real
 * sign-out); THROWS on network/5xx so callers can decide (usually: keep the
 * stale token and mark the session unverified).
 */
export function refreshTokens(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken || isJwtExpired(refreshToken)) return null;
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return null; // revoked — real sign-out
        throw new Error(`Token refresh failed: ${res.status}`);
      }
      if (!data?.accessToken) return null;
      await secureSet(TOKEN_KEY, data.accessToken);
      if (data.refreshToken) await secureSet(REFRESH_KEY, data.refreshToken);
      return data.accessToken as string;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * A usable access token: the stored one when fresh, otherwise /auth/refresh.
 * When the network is down the STALE token is returned — the request fails
 * anyway and the session survives for the next online attempt.
 * Null means signed out for real (no token, or refresh rejected).
 */
export async function getFreshToken(): Promise<string | null> {
  const token = await getToken();
  if (token && !isJwtExpired(token)) return token;
  try {
    return await refreshTokens();
  } catch {
    return token;
  }
}
