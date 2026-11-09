import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { DialerService } from './dialer.service';
import { TelnyxDialerProvider } from './providers/telnyx-dialer.provider';
import { VoiceClientService } from './voice-client.service';

interface TelnyxWebhookEvent {
  data: {
    event_type: string;
    id: string;
    occurred_at: string;
    payload: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/**
 * Dialer webhook receiver — intentionally NOT JWT-guarded. Telnyx webhooks
 * are authenticated via the Ed25519 signature headers verified against
 * TELNYX_PUBLIC_KEY (fail-closed in production).
 *
 * NOTE: the existing TelnyxWebhookModule also consumes Telnyx call events on
 * /telnyx/webhooks/calls (writes call_logs). Point the dialer's webhook_url
 * at this route (or set TELNYX_CALL_WEBHOOK_URL) so dialer_calls rows get
 * status/recording updates.
 *
 * ViciDial has no signed webhook story — status is polled via the provider;
 * a POST /dialer/webhooks/vicidial endpoint is deliberately omitted.
 */
@Controller('dialer/webhooks')
export class DialerWebhookController {
  private readonly logger = new Logger(DialerWebhookController.name);

  constructor(
    private readonly dialerService: DialerService,
    private readonly telnyxProvider: TelnyxDialerProvider,
    private readonly voiceClient: VoiceClientService,
  ) {}

  @Post('telnyx')
  @HttpCode(200)
  async handleTelnyxWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: TelnyxWebhookEvent,
  ): Promise<{ received: true }> {
    // Prefer exact raw bytes; fall back to re-serialized body in tests.
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(body ?? {});

    if (
      !this.telnyxProvider.verifyWebhookSignature?.(rawBody, req.headers)
    ) {
      throw new UnauthorizedException('Invalid Telnyx webhook signature');
    }

    let parsed: TelnyxWebhookEvent | undefined;
    try {
      parsed = Buffer.isBuffer(body) ? JSON.parse(body.toString('utf8')) : body;
    } catch {
      parsed = undefined;
    }
    const eventType = parsed?.data?.event_type ?? 'unknown';
    this.logger.log(`Received dialer Telnyx webhook: ${eventType}`);

    try {
      const event = this.telnyxProvider.ingestWebhook(parsed);
      if (event) {
        await this.dialerService.applyWebhookEvent('telnyx', event);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Error handling dialer webhook "${eventType}": ${message}`,
        stack,
      );
    }

    return { received: true };
  }

  /**
   * Voice-call webhook — the per-call webhook_url settle-voice sets when it
   * originates an AI call is `…/dialer/webhooks/voice-telnyx` (this route
   * inherits the raw-body parser + Ed25519 verification already used by the
   * dialer). The verified event is forwarded to the internal settle-voice
   * service which owns the conversation loop.
   */
  @Post('voice-telnyx')
  @HttpCode(200)
  async handleVoiceTelnyxWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: TelnyxWebhookEvent,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(body ?? {});

    if (
      !this.telnyxProvider.verifyWebhookSignature?.(rawBody, req.headers)
    ) {
      throw new UnauthorizedException('Invalid Telnyx webhook signature');
    }

    let parsed: TelnyxWebhookEvent | undefined;
    try {
      parsed = Buffer.isBuffer(body) ? JSON.parse(body.toString('utf8')) : body;
    } catch {
      parsed = undefined;
    }
    const eventType = parsed?.data?.event_type ?? 'unknown';
    this.logger.log(`Received voice Telnyx webhook: ${eventType}`);

    if (parsed) {
      try {
        await this.voiceClient.forwardTelnyxEvent(parsed);
      } catch (err) {
        // settle-voice down — log and still 200 so Telnyx doesn't storm
        // retries; the service reconciles on its own schedule.
        this.logger.error(
          `Voice webhook forward failed (${eventType}): ${(err as Error).message}`,
        );
      }
    }

    return { received: true };
  }
}
