import * as crypto from 'crypto';

/**
 * Verify an inbound lead-vendor webhook signature.
 *
 * Expected: `X-Lead-Vendor-Signature` (or `X-Signature`) =
 * hex or base64 HMAC-SHA256 of the raw request body, keyed with the
 * per-vendor secret. A `sha256=` prefix is tolerated. Comparison is
 * constant-time; a missing/empty signature or secret always fails.
 */
export function verifyLeadVendorSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const cleaned = signature.replace(/^sha256=/i, '').trim();
  if (!cleaned) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest();

  let provided: Buffer;
  try {
    provided = /^[0-9a-f]+$/i.test(cleaned)
      ? Buffer.from(cleaned, 'hex')
      : Buffer.from(cleaned, 'base64');
  } catch {
    return false;
  }

  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}
