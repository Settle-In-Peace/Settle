import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `dialer_calls` table used by the dialer module
 * (settle-api/src/dialer). Distinct from `call_logs`: this table carries the
 * TCPA consent/dial-mode flags and provider webhook correlation IDs for
 * provider-originated calls.
 *
 * ORCHESTRATOR: register in run-migration.ts —
 *   import { CreateDialerCalls1700000000033 } from './1700000000033-CreateDialerCalls';
 *   ...and append `CreateDialerCalls1700000000033` to the migrations array.
 */
export class CreateDialerCalls1700000000033 implements MigrationInterface {
  name = 'CreateDialerCalls1700000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dialer_direction_enum') THEN
          CREATE TYPE dialer_direction_enum AS ENUM ('inbound', 'outbound');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dialer_call_status_enum') THEN
          CREATE TYPE dialer_call_status_enum AS ENUM ('queued', 'dialing', 'ringing', 'answered', 'completed', 'no_answer', 'busy', 'failed', 'voicemail', 'cancelled');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dialer_calls" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "contact_id" uuid,
        "debt_id" uuid,
        "collection_account_id" uuid,
        "agent_id" uuid,
        "phone_number" varchar(30) NOT NULL,
        "from_number" varchar(30),
        "direction" dialer_direction_enum NOT NULL DEFAULT 'outbound',
        "status" dialer_call_status_enum NOT NULL DEFAULT 'queued',
        "provider" varchar(50) NOT NULL,
        "provider_call_id" varchar(255),
        "manual_dial" boolean NOT NULL DEFAULT true,
        "consent_confirmed" boolean NOT NULL DEFAULT false,
        "consent_method" varchar(32),
        "started_at" timestamp,
        "answered_at" timestamp,
        "ended_at" timestamp,
        "duration" int,
        "recording_url" text,
        "hangup_cause" varchar(100),
        "notes" text,
        "raw_response" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dialer_calls_contact_id" ON "dialer_calls" ("contact_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dialer_calls_debt_id" ON "dialer_calls" ("debt_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dialer_calls_collection_account_id" ON "dialer_calls" ("collection_account_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dialer_calls_agent_id" ON "dialer_calls" ("agent_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dialer_calls_status" ON "dialer_calls" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dialer_calls_provider_call_id" ON "dialer_calls" ("provider_call_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dialer_calls"`);
    await queryRunner.query(`DROP TYPE IF EXISTS dialer_call_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS dialer_direction_enum`);
  }
}
