"use strict";
// Authentication utilities following Prime pattern
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeApiBaseUrl = normalizeApiBaseUrl;
exports.createJsonApiClient = createJsonApiClient;
function normalizeApiBaseUrl(url) {
    if (!url)
        return 'http://localhost:3000';
    // Remove trailing slash
    const normalized = url.replace(/\/$/, '');
    // Ensure protocol
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        return `https://${normalized}`;
    }
    return normalized;
}
class HttpError extends Error {
    constructor(status, message, data) {
        super(message);
        this.status = status;
        this.data = data;
        this.name = 'HttpError';
    }
}
function createJsonApiClient(options) {
    const timeout = options.timeout || 25000;
    return async function jsonApiCall(endpoint, requestOptions = {}) {
        const [baseUrl, token] = await Promise.all([
            options.getBaseUrl(),
            options.getToken ? options.getToken() : Promise.resolve(null),
        ]);
        const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
        const url = `${normalizedBaseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.defaultHeaders || {}),
            ...(requestOptions.headers || {}),
        };
        let controller;
        let timeoutId;
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
            if (timeoutId)
                clearTimeout(timeoutId);
            // 401 = unauthenticated → trigger redirect/clear-auth handlers.
            if (response.status === 401) {
                if (options.onUnauthorized) {
                    options.onUnauthorized();
                }
                const body = await response.json().catch(() => ({ message: 'Unauthorized' }));
                throw new HttpError(401, body.message || 'Unauthorized', body);
            }
            // 403 = forbidden (e.g. account lockout) → keep the backend message and
            // do NOT treat it as a session-expiration event.
            if (response.status === 403) {
                const body = await response.json().catch(() => ({ message: 'Forbidden' }));
                throw new HttpError(403, body.message || 'Forbidden', body);
            }
            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Request failed' }));
                throw new HttpError(response.status, error.message || 'Request failed', error);
            }
            return response.json();
        }
        catch (error) {
            if (timeoutId)
                clearTimeout(timeoutId);
            throw error;
        }
    };
}
//# sourceMappingURL=index.js.map