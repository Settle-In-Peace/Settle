// Auth service — token pair + cached profile live in services/session.ts
// (expo-secure-store with AsyncStorage fallback). Access tokens last 1h;
// the refresh token rotates on every /auth/refresh call.

import { api } from './api';
import {
  getToken,
  getFreshToken,
  getStoredUser,
  getRefreshToken,
  setToken,
  removeToken,
  storeSession,
  storeUser,
  type User,
} from './session';

export type { User };
export {
  getToken,
  getFreshToken,
  getStoredUser,
  getRefreshToken,
  setToken,
  removeToken,
  storeSession,
  storeUser,
};

/** Same-named export kept for existing callers — a fresh (refreshed) token. */
export const freshToken = getFreshToken;

export interface AuthResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: User;
  error?: string;
  /** Present when the account must complete email-OTP before tokens issue. */
  requiresVerification?: boolean;
  email?: string;
  message?: string;
}

/** True only for auth rejection — NOT network failures, timeouts, or 5xx. */
export function isAuthError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

export interface RestoredSession {
  user: User | null;
  /** Token kept but /auth/profile was unreachable — boot last-known state. */
  unverified: boolean;
}

/**
 * Restore at boot: get a usable access token (refreshing when stale), then
 * confirm with GET /auth/profile. A 401/403 clears the session; a network or
 * server failure KEEPS it (unverified) so the app still opens offline — an
 * offline cold start must never sign the user out.
 */
export async function restoreSession(): Promise<RestoredSession> {
  const token = await getFreshToken();
  if (!token) {
    // No usable token — a leftover cached profile is not a session; drop it.
    await removeToken();
    return { user: null, unverified: false };
  }
  try {
    const user = await getProfile(token);
    return { user, unverified: false };
  } catch (err) {
    if (isAuthError(err)) {
      await logout();
      return { user: null, unverified: false };
    }
    return { user: await getStoredUser(), unverified: true };
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/login', { email, password });
  const data = response.data;

  if (data.success && data.accessToken) {
    await storeSession(data);
  }

  return data;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export async function register(data: RegisterData): Promise<AuthResponse> {
  const payload: any = {
    ...data,
  };
  if (data.name && !data.firstName && !data.lastName) {
    payload.firstName = data.name;
  }
  const response = await api.post<AuthResponse>('/auth/register', payload);
  const result = response.data;

  if (result.success && result.accessToken) {
    await storeSession(result);
  }

  return result;
}

/**
 * Complete email-OTP verification after /auth/register — the register
 * endpoint returns requiresVerification (no tokens); this exchanges the
 * emailed code for the token pair.
 */
export async function verifyEmailOtp(email: string, code: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/verify-otp', { email, code });
  const data = response.data;

  if (data.success && data.accessToken) {
    await storeSession(data);
  }

  return data;
}

export async function resendEmailOtp(email: string): Promise<{ success?: boolean; message?: string }> {
  const response = await api.post('/auth/send-otp', { email });
  return response.data;
}

export async function getProfile(token: string): Promise<User> {
  const response = await api.get<User>('/auth/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const user = response.data;
  if (user) {
    await storeUser(user);
  }

  return user;
}

export async function logout(): Promise<void> {
  // Best-effort server-side revocation — the local session clears regardless.
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await api.post('/auth/logout', { refreshToken }).catch(() => {});
  }
  await removeToken();
}

// Required by Apple App Review guideline 5.1.1(v) and Google Play's
// account-deletion policy: users must be able to delete their account
// from inside the app.
export async function deleteAccount(): Promise<{ success: boolean; message?: string }> {
  const response = await api.delete<{ success: boolean; message?: string }>('/auth/account');
  await removeToken();
  return response.data;
}
