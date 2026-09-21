import { Controller, Post, Body, HttpCode, Logger } from '@nestjs/common';
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
 * webhooks are authenticated via signature/header verification performed in
 * the service layer (see TelnyxWebhookService#verifySignature).
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
    @Body() body: TelnyxWebhookEvent,
  ): Promise<{ received: true }> {
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
    @Body() body: TelnyxWebhookEvent,
  ): Promise<{ received: true }> {
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
}
