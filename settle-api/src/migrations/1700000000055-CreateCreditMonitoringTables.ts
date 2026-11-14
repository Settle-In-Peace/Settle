import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consumer credit-monitoring tables — separate from the collections-side
 * `credit_reports` table (migration 23), which is keyed by
 * collection_account_id and not suitable for member monitoring.
 * Idempotent for replays.
 */
export class CreateCreditMonitoringTables1700000000055 implements MigrationInterface {
  name = 'CreateCreditMonitoringTables1700000000055';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_monitor_enrollments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "member_email" varchar(255) NOT NULL,
        "provider" varchar(32) NOT NULL DEFAULT 'mfsn',
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "consent" jsonb NOT NULL,
        "provider_member_ref" varchar(255),
        "last_pulled_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_enrollments"
        DROP CONSTRAINT IF EXISTS "credit_monitor_enrollments_status_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_enrollments"
        ADD CONSTRAINT "credit_monitor_enrollments_status_check"
        CHECK ("status" IN ('pending','active','paused','cancelled','unenrolled'));
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_enrollments"
        DROP CONSTRAINT IF EXISTS "credit_monitor_enrollments_provider_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_enrollments"
        ADD CONSTRAINT "credit_monitor_enrollments_provider_check"
        CHECK ("provider" IN ('mfsn','smartcredit'));
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_credit_monitor_enrollments_user_id"
        ON "credit_monitor_enrollments" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_credit_monitor_enrollments_status"
        ON "credit_monitor_enrollments" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_credit_monitor_enrollments_last_pulled"
        ON "credit_monitor_enrollments" ("last_pulled_at");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_monitor_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "enrollment_id" uuid NOT NULL REFERENCES "credit_monitor_enrollments"("id") ON DELETE CASCADE,
        "pulled_at" timestamp NOT NULL,
        "score" int,
        "score_model" varchar(64),
        "bureau" varchar(32),
        "tradeline_count" int NOT NULL DEFAULT 0,
        "tradelines" jsonb,
        "inquiries" jsonb,
        "public_records" jsonb,
        "raw" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_credit_monitor_snapshots_enrollment_id"
        ON "credit_monitor_snapshots" ("enrollment_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_credit_monitor_snapshots_pulled_at"
        ON "credit_monitor_snapshots" ("pulled_at");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_monitor_alerts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "enrollment_id" uuid NOT NULL REFERENCES "credit_monitor_enrollments"("id") ON DELETE CASCADE,
        "type" varchar(32) NOT NULL,
        "severity" varchar(16) NOT NULL DEFAULT 'info',
        "payload" jsonb NOT NULL,
        "read_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_alerts"
        DROP CONSTRAINT IF EXISTS "credit_monitor_alerts_type_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_alerts"
        ADD CONSTRAINT "credit_monitor_alerts_type_check"
        CHECK ("type" IN ('score_change','new_tradeline','closed_tradeline','balance_change','new_inquiry','new_derogatory'));
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_alerts"
        DROP CONSTRAINT IF EXISTS "credit_monitor_alerts_severity_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "credit_monitor_alerts"
        ADD CONSTRAINT "credit_monitor_alerts_severity_check"
        CHECK ("severity" IN ('info','warning','critical'));
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_credit_monitor_alerts_enrollment_id"
        ON "credit_monitor_alerts" ("enrollment_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_credit_monitor_alerts_unread"
        ON "credit_monitor_alerts" ("enrollment_id") WHERE "read_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_monitor_alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_monitor_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_monitor_enrollments"`);
  }
}
