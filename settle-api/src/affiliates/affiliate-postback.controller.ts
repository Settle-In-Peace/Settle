import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AffiliatesService } from './affiliates.service';
import {
  verifyPostbackSignature,
  verifyPostbackToken,
} from './postback-auth.util';

/**
 * Inbound affiliate-network postbacks — intentionally NOT JWT-guarded.
 * Networks authenticate in one of two ways:
 *
 *   1. GET postback with a static token (the affiliate-standard pattern —
 *      e.g. the network's UI lets you embed a token in the postback URL):
 *        GET /affiliates/postback?network=<name>&token=<secret>&txid=…&payout=…
 *
 *   2. POST signed with HMAC-SHA256 of the raw request body:
 *        X-Affiliate-Signature: <hex|base64>  (sha256= prefix tolerated)
 *      or a `token` field/param equal to the secret for form posts.
 *
 * Network identified by `?network=` or the `X-Affiliate-Network` header.
 * Secret resolution (env only): `AFFILIATE_<NAME>_POSTBACK_SECRET` first,
 * then the shared `AFFILIATE_POSTBACK_SECRET` fallback. When no secret is
 * configured the endpoint fails closed with 503 — unsigned postbacks are
 * never accepted.
 *
 * WIRING NOTE: for byte-exact HMAC verification, add
 * `path.startsWith('/affiliates/postback')` to `isRawBodyWebhookRoute` in
 * main.ts. Without it, JSON POSTs still verify (the body is re-serialized
 * to the same string); form posts should use the `token` param, which does
 * not depend on the raw body.
 */
@Controller('affiliates/postback')
export class AffiliatePostbackController {
  private readonly logger = new Logger(AffiliatePostbackController.name);

  constructor(
    private readonly affiliatesService: AffiliatesService,
    private readonly config: ConfigService,
  ) {}

  /** GET /affiliates/postback?network=<name>&token=<secret>&…params */
  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async handleGet(@Req() req: Request, @Query() query: Record<string, any>) {
    return this.handle(req, query, undefined);
  }

  /** POST /affiliates/postback — JSON or form body, signed or token auth. */
  @Post()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(200)
  async handlePost(
    @Req() req: Request & { rawBody?: Buffer },
    @Query() query: Record<string, any>,
    @Body() body?: Record<string, any>,
  ) {
    return this.handle(req, query, body);
  }

  private async handle(
    req: Request & { rawBody?: Buffer },
    query: Record<string, any>,
    body: Record<string, any> | undefined,
  ) {
    const params: Record<string, unknown> = {
      ...(body && !Buffer.isBuffer(body) ? body : {}),
      ...query,
    };

    const network = this.resolveNetwork(req, params);
    if (!network) {
      throw new BadRequestException(
        'network is required (?network= or X-Affiliate-Network header)',
      );
    }

    const secret = this.postbackSecret(network);
    if (!secret) {
      throw new ServiceUnavailableException(
        `Affiliate postback for "${network}" is not configured. ` +
          `Set AFFILIATE_${network.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_POSTBACK_SECRET or AFFILIATE_POSTBACK_SECRET.`,
      );
    }

    if (!this.authenticated(req, params, body, secret)) {
      this.logger.warn(`Rejected ${network} postback — bad credentials`);
      throw new UnauthorizedException('Invalid affiliate postback credentials');
    }

    // Auth params must not leak into the stored payload.
    const {
      token: _t,
      signature: _s,
      network: _n,
      ...payload
    } = params;

    const result = await this.affiliatesService.recordConversion(
      network,
      payload,
    );
    return {
      received: true,
      id: result.conversion.id,
      duplicate: result.duplicate,
    };
  }

  private resolveNetwork(
    req: Request,
    params: Record<string, unknown>,
  ): string {
    const raw =
      (req.headers['x-affiliate-network'] as string) ||
      (params['network'] as string) ||
      (params['network_name'] as string) ||
      '';
    return String(raw).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60);
  }

  private postbackSecret(network: string): string | undefined {
    const envName = `AFFILIATE_${network
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')}_POSTBACK_SECRET`;
    return (
      this.config.get<string>(envName) ||
      this.config.get<string>('AFFILIATE_POSTBACK_SECRET') ||
      undefined
    );
  }

  private authenticated(
    req: Request & { rawBody?: Buffer },
    params: Record<string, unknown>,
    body: Record<string, any> | undefined,
    secret: string,
  ): boolean {
    // 1. Static token (query `token=` for GET postbacks, `token`/`signature`
    //    field for form POSTs).
    const token =
      (params['token'] as string) || (params['signature'] as string);
    if (verifyPostbackToken(token, secret)) return true;

    // 2. HMAC-SHA256 signature header over the exact body bytes — raw parser
    //    output when the route is in isRawBodyWebhookRoute, else a
    //    re-serialized JSON body (key order survives JSON.parse round-trips).
    const signature =
      (req.headers['x-affiliate-signature'] as string) ||
      (req.headers['x-signature'] as string) ||
      (req.headers['x-hub-signature'] as string);
    if (!signature) return false;

    const signingText =
      req.rawBody?.toString('utf8') ??
      (body && !Buffer.isBuffer(body) ? JSON.stringify(body) : '');
    return verifyPostbackSignature(signingText, signature, secret);
  }
}
