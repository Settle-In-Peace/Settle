"use strict";
// API service factories following Prime pattern
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettleApi = createSettleApi;
const auth_1 = require("../auth");
function createSettleApi(config) {
    const client = (0, auth_1.createJsonApiClient)(config);
    return {
        auth: {
            login: (credentials) => client('/auth/login', {
                method: 'POST',
                body: JSON.stringify(credentials),
            }),
            register: (data) => client('/auth/register', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
            logout: () => client('/auth/logout', { method: 'POST', body: '{}' }),
            profile: () => client('/auth/profile', { method: 'GET' }),
        },
        users: {
            getProfile: () => client('/users/profile', { method: 'GET' }),
            updateProfile: (data) => client('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),
        },
        // Credit bureau (MyFreeScoreNow) — sales/admin only
        credit: {
            /** Provider config status (no upstream call). 503-proof: safe to call unconfigured. */
            status: () => client('/credit-bureau/status', { method: 'GET' }),
            /** Pull a credit report for a consumer (requires FCRA consent metadata). */
            pull: (payload) => client('/credit-bureau/pull', { method: 'POST', body: JSON.stringify(payload) }),
            /** List stored credit reports for a collection account. */
            reportsForAccount: (collectionAccountId) => client(`/credit-bureau/accounts/${collectionAccountId}/reports`, { method: 'GET' }),
            /** Get a single report (raw provider response is stripped server-side). */
            report: (id) => client(`/credit-bureau/reports/${id}`, { method: 'GET' }),
            /** Provider connectivity check (calls upstream — use sparingly). */
            health: () => client('/credit-bureau/health', {
                method: 'GET',
            }),
        },
    };
}
//# sourceMappingURL=index.js.map