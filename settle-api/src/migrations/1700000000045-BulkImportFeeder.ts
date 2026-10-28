import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bulk-import feeder chain:
 *   leads              — street_address/city/alt_phones + needs_skip_trace flag
 *   lead_import_batches — 'xlsx' source value, dnc_blocked counter, metadata
 *     jsonb for dedupe/DNC detail + skip-trace/campaign run summaries
 *   skip_trace_results  — collection_account_id relaxed to nullable so batch
 *     jobs can queue against imported leads; lead_id/import_batch_id links +
 *     estimated_cost for billing metering
 *
 * ORCHESTRATOR: registered in run-migration.ts.
 */
export class BulkImportFeeder1700000000045 implements MigrationInterface {
  name = 'BulkImportFeeder1700000000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New batch source value (usable only after this transaction commits).
    await queryRunner.query(`
      ALTER TYPE lead_import_batch_source_enum ADD VALUE IF NOT EXISTS 'xlsx';
    `);

    // leads — address fields + multi-phone + skip-trace flag.
    await queryRunner.query(`
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "street_address" varchar(255);
    `);
    await queryRunner.query(`
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "city" varchar(100);
    `);
    await queryRunner.query(`
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "alt_phones" jsonb;
    `);
    await queryRunner.query(`
      ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "needs_skip_trace" boolean NOT NULL DEFAULT false;
    `);
    // Backfill: phoneless vendor-imported rows need a trace.
    await queryRunner.query(`
      UPDATE "leads" SET "needs_skip_trace" = true
      WHERE ("phone" IS NULL OR "phone" = '') AND "import_batch_id" IS NOT NULL;
    `);

    // lead_import_batches — DNC counter + feeder-chain metadata.
    await queryRunner.query(`
      ALTER TABLE "lead_import_batches" ADD COLUMN IF NOT EXISTS "dnc_blocked" int NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE "lead_import_batches" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
    `);

    // skip_trace_results — lead-linked batch jobs + cost metering.
    await queryRunner.query(`
      ALTER TABLE "skip_trace_results" ALTER COLUMN "collection_account_id" DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "skip_trace_results" ADD COLUMN IF NOT EXISTS "lead_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "skip_trace_results" ADD COLUMN IF NOT EXISTS "import_batch_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "skip_trace_results" ADD COLUMN IF NOT EXISTS "estimated_cost" decimal(10,4);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skip_trace_results_lead_id" ON "skip_trace_results" ("lead_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skip_trace_results_import_batch_id" ON "skip_trace_results" ("import_batch_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skip_trace_results_import_batch_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skip_trace_results_lead_id"`);
    await queryRunner.query(`ALTER TABLE "skip_trace_results" DROP COLUMN IF EXISTS "estimated_cost"`);
    await queryRunner.query(`ALTER TABLE "skip_trace_results" DROP COLUMN IF EXISTS "import_batch_id"`);
    await queryRunner.query(`ALTER TABLE "skip_trace_results" DROP COLUMN IF EXISTS "lead_id"`);
    await queryRunner.query(`ALTER TABLE "lead_import_batches" DROP COLUMN IF EXISTS "metadata"`);
    await queryRunner.query(`ALTER TABLE "lead_import_batches" DROP COLUMN IF EXISTS "dnc_blocked"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "needs_skip_trace"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "alt_phones"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "city"`);
    await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "street_address"`);
    // Note: 'xlsx' enum value and the NOT-NULL relaxation on
    // skip_trace_results.collection_account_id are not reversed (PG enums
    // can't drop values; tightening the column would fail on batch rows).
  }
}
