import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../entities/lead.entity';
import { LeadVendorAccount } from '../entities/lead-vendor-account.entity';
import { LeadImportBatch } from '../entities/lead-import-batch.entity';
import { LeadPurchase } from '../entities/lead-purchase.entity';
import { CrmModule } from '../crm/crm.module';
import { CollectionsModule } from '../collections/collections.module';
import { LeadVendorsController } from './lead-vendors.controller';
import { LeadVendorWebhookController } from './lead-vendor-webhook.controller';
import { LeadVendorsService } from './lead-vendors.service';
import { LeadVendorRegistry } from './vendor-registry.service';
import { VendorLeadScoringService } from './vendor-lead-scoring.service';

/**
 * Lead-vendor / lead-purchase integration layer.
 *
 * Outbound: generic ping/post adapter (boberdoo / LeadsPedia / LeadProsper
 * compatible) configured via env — `LEADVENDOR_NAMES` +
 * `LEADVENDOR_<NAME>_PING_URL/_POST_URL/_ORDER_URL/_KEY/_FORMAT/…` or a JSON
 * array in `LEADVENDORS_CONFIG`. New vendors are config, not code.
 *
 * Inbound: HMAC-verified webhook (`POST /lead-vendors/import/webhook`) and an
 * authenticated CSV import. All inbound leads normalize into the `leads`
 * table with source tracking (vendor, cost, batch), dedupe on phone/email,
 * and a transparent score (VendorLeadScoringService — replaceable by the AI
 * scorer later).
 *
 * Registration (app.module.ts):
 *   import { LeadVendorsModule } from './lead-vendors/lead-vendors.module';
 *   // + LeadVendorAccount, LeadImportBatch, LeadPurchase in the TypeORM
 *   //   entities + forFeature lists (see REGISTRATION.md)
 *   imports: [ ..., LeadVendorsModule ]
 *
 * Registration (main.ts — for exact-byte webhook HMAC):
 *   const isRawBodyWebhookRoute = (path) =>
 *     ... || path.startsWith('/lead-vendors/import/webhook');
 *
 * Registration (data-source.ts — for migration generation parity):
 *   entities: [ ..., LeadVendorAccount, LeadImportBatch, LeadPurchase ]
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, LeadVendorAccount, LeadImportBatch, LeadPurchase]),
    CrmModule,
    CollectionsModule,
  ],
  controllers: [LeadVendorsController, LeadVendorWebhookController],
  providers: [LeadVendorsService, LeadVendorRegistry, VendorLeadScoringService],
  exports: [LeadVendorsService, LeadVendorRegistry],
})
export class LeadVendorsModule {}
