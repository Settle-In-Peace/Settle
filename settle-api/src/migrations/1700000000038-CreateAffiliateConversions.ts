import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the affiliate_conversions table used by the affiliates module
 * (settle-api/src/affiliates) — inbound postback/conversion events from
 * affiliate networks so referral payouts reconcile (16K plan §1.4).
 *
 * Unique index on (network, transaction_id) dedupes retried/re-fired
 * postbacks; Postgres permits multiple NULL transaction_ids under a unique
 * index, so postbacks without a transaction id still record.
 */
export class CreateAffiliateConversions1700000000038
  implements MigrationInterface
{
  name = 'CreateAffiliateConversions1700000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "affiliate_conversions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "network" varchar(60) NOT NULL,
        "transaction_id" varchar(160),
        "click_id" varchar(160),
        "lead_id" uuid,
        "payout_cents" int,
        "currency" varchar(8) NOT NULL DEFAULT 'USD',
        "status" varchar(20) NOT NULL DEFAULT 'pending'
          CHECK ("status" IN ('pending','approved','rejected','paid')),
        "event_type" varchar(40) NOT NULL DEFAULT 'conversion',
        "raw_payload" jsonb NOT NULL,
        "received_at" timestamp NOT NULL DEFAULT now(),
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_affiliate_conversions_network_txn"
        ON "affiliate_conversions" ("network", "transaction_id")
        WHERE "transaction_id" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_affiliate_conversions_network"
        ON "affiliate_conversions" ("network");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_affiliate_conversions_status"
        ON "affiliate_conversions" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_affiliate_conversions_lead_id"
        ON "affiliate_conversions" ("lead_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "affiliate_conversions";`);
  }
}
