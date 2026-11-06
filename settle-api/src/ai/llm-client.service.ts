import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  /** Override the AI_MODEL default for a single call */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Request response_format: { type: 'json_object' } (OpenAI-compatible) */
  jsonMode?: boolean;
  /**
   * End-user id — sent as `X-SI-User` so the shared gateway can meter and
   * debit credits per account. Omit for unattributed/server-side calls.
   */
  userId?: string;
  /**
   * Sent as `X-SI-Require-Credits: true` on premium SI calls — the gateway
   * answers 402 `insufficient_credits` when the user's balance is < 1.
   */
  requireCredits?: boolean;
}

export interface LlmChatResult {
  content: string;
  model: string;
}

/** Thrown when no AI key is configured — callers should degrade gracefully. */
export class LlmNotConfiguredError extends Error {
  constructor() {
    super(
      'AI is not configured. Set AI_API_KEY (or OPENAI_API_KEY) on the API.',
    );
    this.name = 'LlmNotConfiguredError';
  }
}

/** Thrown when the upstream LLM endpoint fails after retries. */
export class LlmUpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmUpstreamError';
  }
}

/**
 * Thrown when the SI gateway answers 402 `insufficient_credits`. Extends
 * HttpException so it propagates through Nest as a clean client-facing
 * 402 `{ error: 'insufficient_credits' }` instead of a 500 — callers must
 * rethrow it rather than degrade (a billing event is not an outage).
 */
export class InsufficientCreditsError extends HttpException {
  constructor() {
    super(
      {
        error: 'insufficient_credits',
        message:
          'Out of SI credits — top up at /credits to keep using SI features.',
        buy_url: '/credits',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Unified OpenAI-compatible chat-completions client.
 *
 * Env:
 *   AI_BASE_URL    default https://api.openai.com/v1 — any OpenAI-compatible
 *                  endpoint works (Azure-style proxies, OpenRouter, local
 *                  vLLM/Ollama with an OpenAI shim, etc.)
 *   AI_API_KEY     falls back to legacy OPENAI_API_KEY
 *   AI_MODEL       default gpt-4o-mini
 *   AI_TIMEOUT_MS  default 20000 — per-attempt abort timeout
 *   AI_MAX_RETRIES default 2 — retries for network errors, 429 and 5xx only
 *
 * Privacy: prompt contents are NEVER logged (they can contain debtor PII) —
 * only model/status/attempt metadata. The API key is never logged or echoed.
 */
@Injectable()
export class LlmClientService {
  private readonly logger = new Logger(LlmClientService.name);

  constructor(private readonly config: ConfigService) {}

  get baseUrl(): string {
    return (
      this.config.get<string>('AI_BASE_URL') || 'https://api.openai.com/v1'
    ).replace(/\/+$/, '');
  }

  private get apiKey(): string {
    return (
      this.config.get<string>('AI_API_KEY') ||
      this.config.get<string>('OPENAI_API_KEY') ||
      ''
    );
  }

  private get defaultModel(): string {
    return this.config.get<string>('AI_MODEL') || 'gpt-4o-mini';
  }

  private get timeoutMs(): number {
    return this.config.get<number>('AI_TIMEOUT_MS', 20_000);
  }

  private get maxRetries(): number {
    return this.config.get<number>('AI_MAX_RETRIES', 2);
  }

  /** Fail-closed config check — safe for status endpoints and gating. */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.baseUrl);
  }

  /**
   * Run a chat completion. Retries transient failures (network, 429, 5xx);
   * other 4xx responses fail immediately since retrying won't help.
   */
  async chat(
    messages: LlmChatMessage[],
    options: LlmChatOptions = {},
  ): Promise<LlmChatResult> {
    if (!this.isConfigured()) {
      throw new LlmNotConfiguredError();
    }

    const model = options.model || this.defaultModel;
    const body: Record<string, any> = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const attempts = 1 + Math.max(0, this.maxRetries);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            // Shared si-gateway routing — harmless on providers that ignore it.
            'x-si-app': 'settle',
            ...(options.userId
              ? { 'x-si-user': String(options.userId) }
              : {}),
            ...(options.requireCredits
              ? { 'x-si-require-credits': 'true' }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!res.ok) {
          const detail = await this.safeErrorBody(res);
          // Gateway credit gate — surface a clean 402, never retry/degrade.
          if (res.status === 402 && /insufficient_credits/i.test(detail)) {
            throw new InsufficientCreditsError();
          }
          const retryable = res.status === 429 || res.status >= 500;
          // Log status only — never the prompt or response body with PII.
          this.logger.warn(
            `LLM request failed (attempt ${attempt}/${attempts}): HTTP ${res.status}`,
          );
          if (!retryable || attempt === attempts) {
            throw new LlmUpstreamError(
              `LLM upstream error: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`,
              res.status,
            );
          }
          await this.backoff(attempt);
          continue;
        }

        const data: any = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? '';
        return { content, model: data?.model || model };
      } catch (error: any) {
        if (error instanceof LlmUpstreamError) throw error;
        // 402 credit gate / other HTTP exceptions are terminal, not retryable.
        if (error instanceof HttpException) throw error;
        // AbortError / TypeError (network) — retryable
        lastError = error;
        this.logger.warn(
          `LLM request error (attempt ${attempt}/${attempts}): ${error?.name || 'Error'} ${error?.message || ''}`.slice(
            0,
            200,
          ),
        );
        if (attempt < attempts) await this.backoff(attempt);
      }
    }

    throw new LlmUpstreamError(
      `LLM request failed after ${attempts} attempts: ${lastError?.message || 'unknown error'}`,
    );
  }

  /**
   * Chat completion that expects a JSON object back. Enables jsonMode and
   * parses leniently (extracts the first {...} block if the model wrapped it
   * in prose/fences). Returns null on unparseable output.
   */
  async chatJson<T = Record<string, any>>(
    messages: LlmChatMessage[],
    options: LlmChatOptions = {},
  ): Promise<T | null> {
    const { content } = await this.chat(messages, { ...options, jsonMode: true });
    try {
      return JSON.parse(content) as T;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          /* fall through */
        }
      }
      this.logger.warn('LLM returned unparseable JSON content');
      return null;
    }
  }

  private async safeErrorBody(res: Response): Promise<string> {
    try {
      const text = await res.text();
      // Truncate and strip anything that looks like an echoed key.
      return text.slice(0, 200).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
    } catch {
      return '';
    }
  }

  private backoff(attempt: number): Promise<void> {
    const delay = Math.min(500 * Math.pow(2, attempt - 1), 4000);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
