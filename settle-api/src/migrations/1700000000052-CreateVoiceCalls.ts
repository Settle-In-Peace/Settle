import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The `voice_calls` table backs the settle-voice service — the SI-powered
 * outbound AI lead caller (Telnyx Call Control speak/gather loop →
 * si-gateway). The service also bootstraps this DDL itself, but shipping the
 * migration keeps the repo's schema record canonical. Idempotent.
 */
export class CreateVoiceCalls1700000000052 implements MigrationInterface {
  name = 'CreateVoiceCalls1700000000052';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "voice_calls" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "lead_id" uuid,
      "contact_id" uuid,
      "collection_account_id" uuid,
      "agent_id" uuid,
      "org_id" uuid,
      "phone_number" varchar(20) NOT NULL,
      "from_number" varchar(20),
      "provider_call_id" varchar(80),
      "status" varchar(24) NOT NULL DEFAULT 'queued',
      "outcome" varchar(32),
      "disclosure_played" boolean NOT NULL DEFAULT false,
      "turns" int NOT NULL DEFAULT 0,
      "transcript" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "summary" text,
      "consent_confirmed" boolean NOT NULL DEFAULT false,
      "consent_method" varchar(32),
      "si_provider" varchar(80),
      "error" text,
      "started_at" timestamptz,
      "answered_at" timestamptz,
      "ended_at" timestamptz,
      "duration_seconds" int,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_voice_calls_provider" ON "voice_calls" ("provider_call_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_voice_calls_phone" ON "voice_calls" ("phone_number")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_voice_calls_created" ON "voice_calls" ("created_at" DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "voice_calls"`);
  }
}
