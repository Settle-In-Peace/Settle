import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The `skip_trace_lookups` table backs `SkipTraceLookup` (BatchData provider
 * module, commit 0092641) — that feature shipped without a migration, so the
 * dialer's TCPA litigator scrub crashed on `relation "skip_trace_lookups"
 * does not exist` and every outbound call 500'd. Columns mirror the entity
 * 1:1. Idempotent so it is safe whether or not the table was hand-created.
 */
export class CreateSkipTraceLookups1700000000051 implements MigrationInterface {
  name = 'CreateSkipTraceLookups1700000000051';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "skip_trace_lookups" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "lead_id" uuid,
      "org_id" uuid,
      "agent_id" uuid,
      "vendor" varchar(40) NOT NULL,
      "phones" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "match_count" int NOT NULL DEFAULT 0,
      "litigator" boolean NOT NULL DEFAULT false,
      "bankruptcy" boolean NOT NULL DEFAULT false,
      "raw" jsonb,
      "cost_usd" numeric(8,4),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_skip_trace_lookups_lead_id" ON "skip_trace_lookups" ("lead_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_skip_trace_lookups_org_id" ON "skip_trace_lookups" ("org_id")`);
    // Litigator-scrub fast path (dialer assertDialable scans phones[]).
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_skip_trace_lookups_litigator" ON "skip_trace_lookups" ("litigator") WHERE "litigator" = true`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "skip_trace_lookups"`);
  }
}
