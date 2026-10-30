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
import { TelnyxWebhookService } from './telnyx-webhook.service';

/**
 * Telnyx webhook event shape.
 * See: https://developers.telnyx.com/docs/develop/webhooks
 */
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
 * TelnyxWebhookController
 *
 * Receives raw webhook payloads from Telnyx for both call control and SMS
 * events. These endpoints are intentionally NOT guarded by JWT — Telnyx
 * webhooks are authenticated via the Ed25519 signature headers
 * (`telnyx-signature-ed25519` / `telnyx-timestamp-ed25519`) verified against
 * the TELNYX_PUBLIC_KEY env var in TelnyxWebhookService#verifySignature.
 * In production, events that fail or skip verification are rejected with 401.
 */
@Controller('telnyx/webhooks')
export class TelnyxWebhookController {
  private readonly logger = new Logger(TelnyxWebhookController.name);

  constructor(private readonly telnyxWebhookService: TelnyxWebhookService) {}

  /**
   * POST /telnyx/webhooks/calls
   * Receive Telnyx call control webhook events.
   */
  @Post('calls')
  @HttpCode(200)
  async handleCallWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: TelnyxWebhookEvent,
  ): Promise<{ received: true }> {
    this.assertSignature(req, body);

    const eventType = body?.data?.event_type ?? 'unknown';
    const payload = body?.data?.payload ?? {};

    this.logger.log(`Received Telnyx call webhook event: ${eventType}`);

    try {
      await this.telnyxWebhookService.handleCallEvent(eventType, payload, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Error handling Telnyx call webhook event "${eventType}": ${message}`,
        stack,
      );
    }

    return { received: true };
  }

  /**
   * POST /telnyx/webhooks/sms
   * Receive Telnyx SMS webhook events.
   */
  @Post('sms')
  @HttpCode(200)
  async handleSmsWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: TelnyxWebhookEvent,
  ): Promise<{ received: true }> {
    this.assertSignature(req, body);

    const eventType = body?.data?.event_type ?? 'unknown';
    const payload = body?.data?.payload ?? {};

    this.logger.log(`Received Telnyx SMS webhook event: ${eventType}`);

    try {
      await this.telnyxWebhookService.handleSmsEvent(eventType, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `Error handling Telnyx SMS webhook event "${eventType}": ${message}`,
        stack,
      );
    }

    return { received: true };
  }

  /**
   * Reject the request when the Telnyx signature check fails.
   * The raw body is provided by the raw() body parser mounted in main.ts.
   */
  private assertSignature(
    req: Request & { rawBody?: Buffer },
    body: TelnyxWebhookEvent,
  ): void {
    // Prefer the exact raw bytes; fall back to a re-serialized body only if
    // the raw parser was bypassed (e.g. in tests).
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(body ?? {});

    if (!this.telnyxWebhookService.verifySignature(rawBody, req.headers)) {
      throw new UnauthorizedException('Invalid Telnyx webhook signature');
    }
  }
}
