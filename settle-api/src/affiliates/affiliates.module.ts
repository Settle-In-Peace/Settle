import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AffiliateConversion } from './affiliate-conversion.entity';
import { AffiliatePostbackController } from './affiliate-postback.controller';
import { AffiliatesController } from './affiliates.controller';
import { AffiliatesService } from './affiliates.service';

/**
 * AffiliatesModule — inbound affiliate-network postback receiver +
 * reconciliation surface (16K plan §1.4).
 *
 * Routes:
 *   GET  /affiliates/postback            — network postback (token auth)
 *   POST /affiliates/postback            — network postback (HMAC or token)
 *   GET  /affiliates/conversions         — admin list (?network&status&limit)
 *   GET  /affiliates/conversions/summary — admin payout totals
 *   PATCH /affiliates/conversions/:id    — admin status (pending→approved→paid)
 *
 * Secrets: AFFILIATE_<NAME>_POSTBACK_SECRET per network, or the shared
 * AFFILIATE_POSTBACK_SECRET fallback. Unconfigured networks get 503.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AffiliateConversion])],
  controllers: [AffiliatePostbackController, AffiliatesController],
  providers: [AffiliatesService],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
