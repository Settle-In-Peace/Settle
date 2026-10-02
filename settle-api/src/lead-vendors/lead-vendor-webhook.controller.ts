import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { LeadVendorsService } from './lead-vendors.service';
import { LeadVendorRegistry } from './vendor-registry.service';
import { verifyLeadVendorSignature } from './webhook-signature.util';

/**
 * Inbound vendor lead posts — intentionally NOT JWT-guarded. Vendors
 * authenticate via a per-vendor HMAC-SHA256 signature over the raw request
 * body (`X-Lead-Vendor-Signature`, `X-Signature`, or `X-Hub-Signature`;
 * `sha256=` prefix tolerated). The vendor is identified by `?vendor=<name>`
 * or the `X-Lead-Vendor`/`X-Vendor` header.
 *
 * Secret resolution (env only, never DB): LEADVENDOR_<NAME>_WEBHOOK_SECRET,
 * or the env var named by the account row's webhook_secret_ref. When no
 * secret is configured the endpoint fails closed with 503 — unsigned
 * webhook posts are never accepted.
 *
 * NOTE for app wiring: add `path.startsWith('/lead-vendors/import/webhook')`
 * to `isRawBodyWebhookRoute` in main.ts so verification runs on the exact
 * raw bytes (falls back to a re-serialized body when the raw parser skipped
 * the route, e.g. tests).
 */
@Controller('lead-vendors/import')
export class LeadVendorWebhookController {
  private readonly logger = new Logger(LeadVendorWebhookController.name);

  constructor(
    private readonly leadVendorsService: LeadVendorsService,
    private readonly registry: LeadVendorRegistry,
  ) {}

  /**
   * POST /lead-vendors/import/webhook?vendor=<name>
   * Body: a lead object, an array of leads, or { leads: [...] }.
   */
  @Post('webhook')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Query('vendor') vendorQuery?: string,
    @Body() body?: any,
  ) {
    const vendor = (
      vendorQuery ||
      (req.headers['x-lead-vendor'] as string) ||
      (req.headers['x-vendor'] as string) ||
      ''
    ).toLowerCase();
    if (!vendor) {
      throw new BadRequestException(
        'vendor is required (?vendor= or X-Lead-Vendor header)',
      );
    }

    const secret = await this.registry.webhookSecret(vendor);
    if (!secret) {
      throw new ServiceUnavailableException(
        `Lead vendor "${vendor}" webhook is not configured. Set ${LeadVendorRegistry.envPrefix(vendor)}_WEBHOOK_SECRET.`,
      );
    }

    const contentType = req.headers['content-type'] ?? '';
    const { payload, signingText } = this.extractBody(req, body, contentType);

    const signature =
      (req.headers['x-lead-vendor-signature'] as string) ||
      (req.headers['x-signature'] as string) ||
      (req.headers['x-hub-signature'] as string);

    if (!verifyLeadVendorSignature(signingText, signature, secret)) {
      this.logger.warn(`Rejected ${vendor} webhook — bad signature`);
      throw new UnauthorizedException('Invalid lead vendor webhook signature');
    }

    const result = await this.leadVendorsService.ingestWebhook(vendor, payload);
    return {
      received: true,
      batchId: result.batch.id,
      imported: result.batch.imported,
      duplicates: result.batch.duplicates,
      invalid: result.batch.invalid,
    };
  }

  /**
   * Prefer the exact raw bytes (raw() parser in main.ts); fall back to a
   * re-serialized body when the route wasn't raw-parsed. The fallback means
   * vendors must sign exactly the bytes they send — which they do.
   */
  private extractBody(
    req: Request & { rawBody?: Buffer },
    body: any,
    contentType: string,
  ): { payload: any; signingText: string } {
    const raw = req.rawBody?.toString('utf8');

    let payload = body;
    if (raw !== undefined) {
      // Route was raw-parsed: body is the Buffer — decode it ourselves.
      if (contentType.includes('json')) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      } else if (contentType.includes('urlencoded')) {
        payload = Object.fromEntries(new URLSearchParams(raw));
      } else {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = raw;
        }
      }
      return { payload, signingText: raw };
    }

    if (Buffer.isBuffer(payload)) {
      const text = payload.toString('utf8');
      try {
        return { payload: JSON.parse(text), signingText: text };
      } catch {
        return {
          payload: Object.fromEntries(new URLSearchParams(text)),
          signingText: text,
        };
      }
    }

    const signingText = contentType.includes('urlencoded')
      ? new URLSearchParams(payload ?? {}).toString()
      : JSON.stringify(payload ?? {});
    return { payload, signingText };
  }
}
