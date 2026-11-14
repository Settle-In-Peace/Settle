import { create, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, getFreshToken, refreshTokens } from './session';

// EXPO_PUBLIC_* vars are inlined by Metro at bundle time.
// Dev override: set EXPO_PUBLIC_API_URL=http://localhost:4025 in settle-mobile/.env
// Production builds fall back to the live API.
export { API_BASE_URL };

export const api = create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  // getFreshToken refreshes the 1h access token via the rotating refresh
  // token before it expires — offline it hands back the stale token and the
  // request just fails, which callers already tolerate.
  const token = await getFreshToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh-on-401: swap the token once via the single-flight refresher, then
// retry the request. A second 401 means the session is really dead.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const cfg = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (
      error.response?.status === 401 &&
      cfg &&
      !cfg._retried &&
      !cfg.url?.includes('/auth/refresh')
    ) {
      cfg._retried = true;
      const fresh = await refreshTokens().catch(() => null);
      if (fresh) {
        cfg.headers.Authorization = `Bearer ${fresh}`;
        return api(cfg);
      }
    }
    return Promise.reject(error);
  },
);
