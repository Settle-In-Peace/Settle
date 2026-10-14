import * as crypto from 'crypto';
import { verifyLeadVendorSignature } from '../lead-vendors/webhook-signature.util';

/**
 * Constant-time comparison of a postback token against the configured
 * secret. Affiliate networks that send GET postbacks authenticate by a
 * static token embedded in the postback URL (`&token=<secret>`) — there is
 * no body to HMAC. Missing/empty values always fail.
 */
export function verifyPostbackToken(
  token: string | undefined,
  secret: string,
): boolean {
  if (!token || !secret) return false;
  const a = Buffer.from(token.trim());
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify an HMAC-SHA256 postback signature (hex or base64, `sha256=` prefix
 * tolerated). Delegates to the shared lead-vendor verifier — same scheme:
 * signature over the exact raw body bytes, or over the re-serialized body
 * when the route wasn't raw-parsed.
 */
export function verifyPostbackSignature(
  signingText: string,
  signature: string | undefined,
  secret: string,
): boolean {
  return verifyLeadVendorSignature(signingText, signature, secret);
}
