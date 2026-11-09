import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Thrown when the settle-voice service is unreachable or errors. */
export class VoiceServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'VoiceServiceError';
  }
}

export interface VoiceCallRequest {
  to: string;
  leadId?: string;
  contactId?: string;
  collectionAccountId?: string;
  agentId?: string;
  orgId?: string;
  consentConfirmed?: boolean;
  leadName?: string;
}

/**
 * Thin client for the settle-voice service — the lean Node process
 * (pm2 `settle-voice`) that runs the Telnyx speak/gather + si-gateway
 * conversation loop and owns the `voice_calls` table.
 *
 * Env:
 *   SETTLE_VOICE_URL — internal base URL (default http://localhost:4027)
 *   SETTLE_VOICE_KEY — shared service key sent as `x-voice-key`
 *   SETTLE_VOICE_TIMEOUT_MS — default 15000
 *
 * The key is never logged; only method + path + status appear in logs.
 */
@Injectable()
export class VoiceClientService {
  private readonly logger = new Logger(VoiceClientService.name);

  constructor(private readonly config: ConfigService) {}

  get baseUrl(): string {
    return this.config
      .get<string>('SETTLE_VOICE_URL', 'http://localhost:4027')
      .replace(/\/+$/, '');
  }

  private get key(): string {
    return this.config.get<string>('SETTLE_VOICE_KEY', '');
  }

  private get timeoutMs(): number {
    return this.config.get<number>('SETTLE_VOICE_TIMEOUT_MS', 15_000);
  }

  /** Fail-closed config check — settle-voice needs a shared key. */
  isConfigured(): boolean {
    return Boolean(this.key);
  }

  private async request<T = any>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-voice-key': this.key,
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new VoiceServiceError(
        `settle-voice unreachable: ${isTimeout ? 'timeout' : (err as Error).message}`,
      );
    }
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new VoiceServiceError(
        `settle-voice ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  /** Originate an AI call — settle-voice re-runs the consent/DNC gates. */
  async placeVoiceCall(req: VoiceCallRequest): Promise<any> {
    return this.request('/calls', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async listVoiceCalls(): Promise<{ calls: any[] }> {
    return this.request('/calls');
  }

  async getVoiceCall(id: string): Promise<{ call: any }> {
    return this.request(`/calls/${id}`);
  }

  /**
   * Forward a signature-verified Telnyx webhook event into the voice
   * service. settle-api verifies Ed25519 first; the internal hop is
   * authenticated by the shared voice key (localhost-only surface).
   */
  async forwardTelnyxEvent(event: Record<string, any>): Promise<void> {
    await this.request('/internal/telnyx-event', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }
}
