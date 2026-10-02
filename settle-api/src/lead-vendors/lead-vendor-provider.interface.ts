/**
 * Lead-vendor integration contract.
 *
 * A `LeadVendorProvider` is the outbound side of a lead-buying integration:
 * it knows how to ask a vendor for a price (ping), buy leads (post / order),
 * and report whether it is configured. Inbound delivery (vendor-posted
 * webhooks, CSV files) is handled by LeadVendorsService — providers only need
 * to expose outbound calls.
 *
 * The canonical implementation is the generic ping/post adapter
 * (`PingPostVendorProvider`), which covers the boberdoo / LeadsPedia /
 * LeadProsper wire format and is configured entirely via env vars —
 * new vendors are config, not code.
 */

/** A purchasable product line a vendor exposes. */
export interface LeadVendorProduct {
  id: string;
  name: string;
  description?: string;
  /** Static per-lead price in USD when the vendor publishes one. */
  price?: number;
  /** How leads for this product are delivered. */
  delivery?: 'ping_post' | 'api_order' | 'webhook' | 'file';
}

/** Filters describing the leads we want to buy. */
export interface LeadCriteria {
  states?: string[];
  debtTypes?: string[];
  minDebt?: number;
  maxDebt?: number;
  minScore?: number;
  /** Walk-away price ceiling per lead (used to reject expensive pings). */
  maxPricePerLead?: number;
  [key: string]: unknown;
}

/** A normalized lead payload used for ping and post calls. */
export interface VendorLeadData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state?: string;
  zipCode?: string;
  totalDebt?: number;
  debtTypes?: string[];
  tcpaConsent?: boolean;
  /** Vendor-side id echoed back during post, when known. */
  vendorLeadId?: string;
  [key: string]: unknown;
}

/** Result of a ping (price/bid request). */
export interface PingResult {
  accepted: boolean;
  pingId?: string;
  price?: number;
  rejectionReason?: string;
  raw?: unknown;
}

/** Result of a post (full lead delivery). */
export interface PostResult {
  accepted: boolean;
  postId?: string;
  price?: number;
  rejectionReason?: string;
  /** Vendor-provided redirect/landing URL for the consumer, when returned. */
  redirectUrl?: string;
  raw?: unknown;
}

/** Result of a bulk purchase/order call. */
export interface VendorPurchaseResult {
  purchaseId?: string;
  /** Leads returned inline by the vendor (empty when delivery is async). */
  leads: VendorLeadData[];
  quantityReceived: number;
  pricePerLead?: number;
  totalCost?: number;
  raw?: unknown;
}

/** Status snapshot for UI cards — safe to call when unconfigured. */
export interface LeadVendorStatus {
  name: string;
  displayName: string;
  configured: boolean;
  active: boolean;
  supportsPingPost: boolean;
  products: LeadVendorProduct[];
}

export interface LeadVendorProvider {
  readonly name: string;
  /** Human-readable vendor name for UI/status. */
  readonly displayName: string;
  /** False → the service must fail closed with 503 before calling upstream. */
  isConfigured(): boolean;
  /** Config/connectivity snapshot — never throws when unconfigured. */
  status(): LeadVendorStatus | Promise<LeadVendorStatus>;
  /** Vendor product catalogue (static for the generic adapter). */
  listProducts(): LeadVendorProduct[] | Promise<LeadVendorProduct[]>;
  /** Price a lead for the given criteria (ping, or static price). */
  priceLead(criteria: LeadCriteria): Promise<PingResult>;
  /** Buy `quantity` leads matching `criteria`. */
  purchaseLeads(
    criteria: LeadCriteria,
    quantity: number,
  ): Promise<VendorPurchaseResult>;
  /** Whether this vendor supports the ping→post flow. */
  readonly supportsPingPost: boolean;
  /** Ping: send lead criteria → bid/price + acceptance. */
  ping(lead: VendorLeadData): Promise<PingResult>;
  /** Post: send the full lead (usually with pingId) → accept/reject. */
  post(lead: VendorLeadData, pingId?: string): Promise<PostResult>;
}

/** Thrown when a vendor lacks the env config needed for an outbound call. */
export class LeadVendorNotConfiguredError extends Error {
  constructor(vendorName: string) {
    super(
      `Lead vendor "${vendorName}" is not configured. Set LEADVENDOR_${vendorName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PING_URL/_POST_URL (and _KEY if required), or add it to LEADVENDORS_CONFIG.`,
    );
    this.name = 'LeadVendorNotConfiguredError';
  }
}

/** Thrown for upstream failures after retries are exhausted. */
export class LeadVendorUpstreamError extends Error {
  constructor(
    public readonly vendor: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LeadVendorUpstreamError';
  }
}
