import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SiCreditPack {
  id: string;
  name: string;
  priceUsd: number;
  credits: number;
}

/**
 * Default pack catalog — 1 credit ≈ $0.01 of SI inference. The whole catalog
 * is overridable via `SI_CREDIT_PACKS` (JSON array of the same shape) so
 * pricing can change on the oracle env without a redeploy.
 */
const DEFAULT_PACKS: SiCreditPack[] = [
  { id: 'starter', name: 'Starter pack', priceUsd: 5, credits: 500 },
  { id: 'growth', name: 'Growth pack', priceUsd: 20, credits: 2000 },
  { id: 'pro', name: 'Pro pack', priceUsd: 50, credits: 5000 },
];

/**
 * Thin client for the shared si-gateway credits API
 * (`{SI_GATEWAY_URL}/credits/*` — same origin the LLM chat calls already use
 * via AI_BASE_URL, `http://localhost:4030/v1` on oracle).
 *
 *   GET  {base}/credits/balance?app&user          — reads a user's balance
 *   POST {base}/credits/topup                     — admin-keyed credit grant
 *     body: { app, user_key, amount, reason, ref }
 *
 * The balance read fails CLOSED to 0: when the gateway is unreachable the
 * premium SI calls that carry `X-SI-Require-Credits` will 402 anyway, so a
 * "0" display is consistent with what the user can actually do.
 */
@Injectable()
export class SiCreditsService {
  private readonly logger = new Logger(SiCreditsService.name);

  constructor(private readonly config: ConfigService) {}

  /** Ledger app slug — the primary-key half the gateway meters under. */
  readonly app = 'settle';

  /**
   * Credits API lives on the same origin as the OpenAI-compatible gateway.
   * SI_GATEWAY_URL wins; AI_BASE_URL is the fallback because on oracle it is
   * already `http://localhost:4030/v1`. Empty → unconfigured.
   */
  private get gatewayBase(): string {
    return (
      this.config.get<string>('SI_GATEWAY_URL') ||
      this.config.get<string>('AI_BASE_URL') ||
      ''
    ).replace(/\/+$/, '');
  }

  /** Balance reads authenticate with the regular gateway key (AI_API_KEY). */
  private get gatewayKey(): string {
    return (
      this.config.get<string>('AI_API_KEY') ||
      this.config.get<string>('OPENAI_API_KEY') ||
      ''
    );
  }

  private get adminKey(): string {
    return this.config.get<string>('SI_GATEWAY_ADMIN_KEY') || '';
  }

  isConfigured(): boolean {
    return this.gatewayBase.length > 0;
  }

  getPacks(): SiCreditPack[] {
    const raw = this.config.get<string>('SI_CREDIT_PACKS');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SiCreditPack[];
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (p) =>
              p &&
              typeof p.id === 'string' &&
              Number.isFinite(Number(p.priceUsd)) &&
              Number.isFinite(Number(p.credits)),
          )
        ) {
          return parsed.map((p) => ({
            id: String(p.id),
            name: String(p.name || p.id),
            priceUsd: Number(p.priceUsd),
            credits: Number(p.credits),
          }));
        }
        this.logger.warn('SI_CREDIT_PACKS is not a valid pack array — using defaults');
      } catch {
        this.logger.warn('SI_CREDIT_PACKS is not valid JSON — using defaults');
      }
    }
    return DEFAULT_PACKS;
  }

  getPack(packId: string): SiCreditPack | undefined {
    return this.getPacks().find((p) => p.id === packId);
  }

  /**
   * User credit balance at the gateway. Fails closed to 0 — the premium
   * call path 402s in the same situation, so the number stays truthful.
   */
  async getBalance(userId: string): Promise<number> {
    if (!this.gatewayBase || !userId) return 0;
    try {
      const res = await fetch(
        `${this.gatewayBase}/credits/balance?app=${this.app}&user=${encodeURIComponent(userId)}`,
        {
          signal: AbortSignal.timeout(8_000),
          headers: this.gatewayKey
            ? { authorization: `Bearer ${this.gatewayKey}` }
            : undefined,
        },
      );
      if (!res.ok) return 0;
      const data = (await res.json().catch(() => ({}))) as {
        balance?: number;
        credits?: number;
        amount?: number;
      };
      const balance = Number(data?.balance ?? data?.credits ?? data?.amount ?? 0);
      return Number.isFinite(balance) ? balance : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Admin-keyed credit grant at the gateway. `ref` doubles as the
   * idempotency key — always pass `stripe:<checkout-session-id>` so a
   * redelivered webhook can be audited against the ledger.
   */
  async topUp(
    userId: string,
    amount: number,
    reason: string,
    ref: string,
  ): Promise<{ balance?: number; ref?: string }> {
    if (!this.gatewayBase) {
      throw new ServiceUnavailableException({
        error: 'si_gateway_unconfigured',
        message: 'SI gateway URL is not configured on this deployment.',
      });
    }
    if (!this.adminKey) {
      throw new ServiceUnavailableException({
        error: 'si_gateway_admin_key_missing',
        message:
          'SI_GATEWAY_ADMIN_KEY is not set — credit topups are disabled until the admin key is configured.',
      });
    }
    const res = await fetch(`${this.gatewayBase}/credits/topup`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'x-si-app': this.app,
        'x-admin-key': this.adminKey,
        authorization: `Bearer ${this.adminKey}`,
      },
      body: JSON.stringify({
        app: this.app,
        user_key: userId,
        amount,
        reason,
        ref,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(
        `SI gateway topup failed (${res.status}): ${body.slice(0, 200) || res.statusText}`,
      );
    }
    const data = (await res.json().catch(() => ({}))) as {
      balance?: number;
      new_balance?: number;
      ref?: string;
    };
    return {
      balance: data?.balance ?? data?.new_balance,
      ref: data?.ref,
    };
  }
}
