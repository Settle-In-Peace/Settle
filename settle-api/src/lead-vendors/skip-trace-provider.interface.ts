/**
 * Vendor-neutral skip-trace provider contract.
 *
 * The batch queue (`POST /lead-vendors/import/:batchId/skip-trace`) resolves
 * one provider by name (`SKIP_TRACE_PROVIDER`, default `stub`) and calls
 * `lookup()` once per phoneless lead. A real vendor (TLO/Accurint/IDI/etc.)
 * drops in by implementing this interface and registering in
 * `lead-vendors.module.ts` + the provider map in LeadVendorsService — no
 * queue/merge logic changes needed.
 */

export interface SkipTraceQuery {
  leadId?: string;
  firstName?: string;
  lastName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
}

export interface SkipTracePhone {
  number: string; // E.164 preferred — raw vendor values are normalized by the caller
  type?: string; // mobile | landline | voip | work | ...
  confidence?: string; // vendor scale — preserved verbatim
}

export interface SkipTraceLookupResult {
  /** Terminal state for the skip_trace_results row. */
  status: 'success' | 'partial' | 'failed' | 'manual';
  phones?: SkipTracePhone[];
  addresses?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    type?: string;
    confidence?: string;
  }[];
  emails?: { address?: string; type?: string; confidence?: string }[];
  /** Vendor confidence 0..1 — stored on the result row. */
  confidence?: number;
  /** Per-lookup vendor cost estimate in USD — metered for billing. */
  estimatedCost?: number;
  notes?: string;
  raw?: Record<string, unknown>;
}

export class SkipTraceNotConfiguredError extends Error {
  constructor(provider: string) {
    super(
      `Skip-trace provider "${provider}" is not configured — set its env vars (see .env.example)`,
    );
    this.name = 'SkipTraceNotConfiguredError';
  }
}

export interface SkipTraceProvider {
  readonly name: string;
  /** False → callers fail closed (503), like dialer/lead-vendor providers. */
  isConfigured(): boolean;
  lookup(query: SkipTraceQuery): Promise<SkipTraceLookupResult>;
}
