import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * PCI guard: keys that may carry raw cardholder data. Our API is designed so
 * PAN/CVV never reaches this server — if a payload contains any of these keys
 * the request is rejected outright (fail-closed, before any provider call).
 */
const SENSITIVE_KEY_RE =
  /(card_?number|ccnum|cc_?number|card_?pan|\bpan\b|cvv|cvc|cvd|cvn|card_?cvv|security_?code|cc_?exp|card_?exp|exp_?month|exp_?year|expir)/i;

/** Allowlisted card metadata keys (last4/brand only — never PAN). */
const CARD_METADATA_ALLOWLIST = new Set([
  'cardlast4',
  'card_last4',
  'cardbrand',
  'card_brand',
]);

/** 13–19 contiguous digits under a card-ish key = likely PAN. */
const PAN_VALUE_RE = /^\d{13,19}$/;

/**
 * Recursively reject payloads containing cardholder-data fields. Call at the
 * top of every charge path — cheap defense-in-depth on top of the DTO
 * whitelist, in case callers post extra fields (whitelist:true strips them,
 * but we want an explicit rejection, not silent stripping).
 */
export function assertNoSensitiveCardData(
  payload: unknown,
  path = 'body',
): void {
  if (payload === null || payload === undefined) return;
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoSensitiveCardData(v, `${path}[${i}]`));
    return;
  }
  if (typeof payload !== 'object') return;

  for (const [key, value] of Object.entries(payload as Record<string, any>)) {
    const keyPath = `${path}.${key}`;
    const normalized = key.toLowerCase();
    if (
      SENSITIVE_KEY_RE.test(normalized) &&
      !CARD_METADATA_ALLOWLIST.has(normalized)
    ) {
      throw new BadRequestException(
        `Sensitive card field "${keyPath}" is not accepted — use a processor token (Collect.js/Accept.js/hosted fields). Raw PAN/CVV never touches this server.`,
      );
    }
    // Defense-in-depth: a bare 13–19 digit value under a card-ish key.
    if (
      typeof value === 'string' &&
      PAN_VALUE_RE.test(value.replace(/[ -]/g, '')) &&
      /card|cc|pan|account/i.test(normalized) &&
      !CARD_METADATA_ALLOWLIST.has(normalized)
    ) {
      throw new BadRequestException(
        `Field "${keyPath}" looks like a card number — use a processor token instead.`,
      );
    }
    if (value && typeof value === 'object') {
      assertNoSensitiveCardData(value, keyPath);
    }
  }
}

/**
 * Remove any PAN/CVV-shaped keys from a gateway response before persisting.
 * Gateways don't echo PAN, but we store `raw_response` jsonb for audit and
 * belt-and-suspenders hygiene costs nothing.
 */
export function sanitizeGatewayResponse(
  raw: Record<string, any> | undefined,
): Record<string, any> | undefined {
  if (!raw || typeof raw !== 'object') return raw;
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = key.toLowerCase();
    if (
      SENSITIVE_KEY_RE.test(normalized) &&
      !CARD_METADATA_ALLOWLIST.has(normalized)
    ) {
      clean[key] = '[redacted]';
      continue;
    }
    clean[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? sanitizeGatewayResponse(value)
        : value;
  }
  return clean;
}

/** Constant-time string compare (hex or plain). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hmacSha256Hex(key: string, message: string | Buffer): string {
  return createHmac('sha256', key).update(message).digest('hex');
}

/** cents → "12.34" for form-encoded gateway APIs. */
export function centsToAmount(amountCents: number): string {
  return (Math.round(amountCents) / 100).toFixed(2);
}
