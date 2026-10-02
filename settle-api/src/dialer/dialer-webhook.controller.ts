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

    const eventType = body?.data?.event_type ?? 'unknown';
    this.logger.log(`Received dialer Telnyx webhook: ${eventType}`);

    try {
      const event = this.telnyxProvider.ingestWebhook(body);
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
}
