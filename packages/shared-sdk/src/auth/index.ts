// Authentication utilities following Prime pattern

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt?: string;
}

export interface CreateJsonApiClientOptions {
  getBaseUrl: () => string | Promise<string>;
  getToken?: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

export function normalizeApiBaseUrl(url: string): string {
  if (!url) return 'http://localhost:3000';
  
  // Remove trailing slash
  const normalized = url.replace(/\/$/, '');
  
  // Ensure protocol
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    return `https://${normalized}`;
  }
  
  return normalized;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function createJsonApiClient(options: CreateJsonApiClientOptions) {
  const timeout = options.timeout || 25000;

  return async function jsonApiCall<T>(
    endpoint: string,
    requestOptions: RequestInit = {}
  ): Promise<T> {
    const [baseUrl, token] = await Promise.all([
      options.getBaseUrl(),
      options.getToken ? options.getToken() : Promise.resolve(null),
    ]);
    
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
    const url = `${normalizedBaseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.defaultHeaders || {}),
      ...(requestOptions.headers as Record<string, string> || {}),
    };

    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeout > 0) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller?.abort(), timeout);
    }

    try {
      const response = await fetch(url, {
        ...requestOptions,
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (timeoutId) clearTimeout(timeoutId);

      // 401 = unauthenticated → trigger redirect/clear-auth handlers.
      if (response.status === 401) {
        if (options.onUnauthorized) {
          options.onUnauthorized();
        }
        const body = await response.json().catch(() => ({ message: 'Unauthorized' }));
        throw new HttpError(401, (body as { message?: string }).message || 'Unauthorized', body as Record<string, unknown>);
      }

      // 403 = forbidden (e.g. account lockout) → keep the backend message and
      // do NOT treat it as a session-expiration event.
      if (response.status === 403) {
        const body = await response.json().catch(() => ({ message: 'Forbidden' }));
        throw new HttpError(403, (body as { message?: string }).message || 'Forbidden', body as Record<string, unknown>);
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new HttpError(response.status, (error as { message?: string }).message || 'Request failed', error as Record<string, unknown>);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  };
}