import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the per-seat DaaS tenancy tables used by settle-api/src/seats:
 *   orgs        — the customer org (collection agency / law firm = collector of record)
 *   org_members — user↔org membership with tenant role (org_owner/org_manager/agent)
 *   seats       — per-user dialing licenses inside an org
 *   seat_usage  — monthly per-seat rollup synced from dialer_calls
 *   seat_plans  — plan catalog (seeded: starter/pro/enterprise)
 *
 * Also extends dialer_calls with org_id (tenant attribution) and
 * disposition/disposition_at (post-call outcome set from the agent dashboard).
 *
 * ORCHESTRATOR: registered in run-migration.ts.
 */
export class CreateOrgSeatTables1700000000044 implements MigrationInterface {
  name = 'CreateOrgSeatTables1700000000044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_status_enum') THEN
          CREATE TYPE org_status_enum AS ENUM ('active', 'suspended', 'canceled');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role_enum') THEN
          CREATE TYPE org_role_enum AS ENUM ('org_owner', 'org_manager', 'agent');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_member_status_enum') THEN
          CREATE TYPE org_member_status_enum AS ENUM ('active', 'invited', 'suspended');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seat_tier_enum') THEN
          CREATE TYPE seat_tier_enum AS ENUM ('starter', 'pro', 'enterprise');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seat_status_enum') THEN
          CREATE TYPE seat_status_enum AS ENUM ('active', 'suspended', 'released');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orgs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "billing_email" varchar(255),
        "owner_user_id" uuid,
        "plan_code" varchar(50),
        "seats_purchased" int NOT NULL DEFAULT 0,
        "stripe_customer_id" varchar(255),
        "stripe_subscription_id" varchar(255),
        "subscription_status" varchar(50),
        "status" org_status_enum NOT NULL DEFAULT 'active',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_orgs_owner_user_id" ON "orgs" ("owner_user_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "org_members" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "org_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "org_role" org_role_enum NOT NULL DEFAULT 'agent',
        "status" org_member_status_enum NOT NULL DEFAULT 'active',
        "invited_by" uuid,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "uq_org_members_org_user" UNIQUE ("org_id", "user_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_org_members_org_id" ON "org_members" ("org_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_org_members_user_id" ON "org_members" ("user_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "seats" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "org_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "seat_tier" seat_tier_enum NOT NULL DEFAULT 'starter',
        "monthly_minutes_included" int NOT NULL DEFAULT 0,
        "status" seat_status_enum NOT NULL DEFAULT 'active',
        "assigned_by" uuid,
        "assigned_at" timestamp,
        "released_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_seats_org_id" ON "seats" ("org_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_seats_user_id" ON "seats" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_seats_status" ON "seats" ("status");
    `);
    // One active seat per user per org.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_seats_org_user_active"
      ON "seats" ("org_id", "user_id") WHERE "status" = 'active';
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "seat_usage" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "seat_id" uuid NOT NULL,
        "org_id" uuid NOT NULL,
        "period" varchar(7) NOT NULL,
        "minutes_used" int NOT NULL DEFAULT 0,
        "calls_placed" int NOT NULL DEFAULT 0,
        "rpc_count" int NOT NULL DEFAULT 0,
        "overage_minutes" int NOT NULL DEFAULT 0,
        "last_synced_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "uq_seat_usage_seat_period" UNIQUE ("seat_id", "period")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_seat_usage_org_period" ON "seat_usage" ("org_id", "period");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "seat_plans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "code" varchar(50) NOT NULL UNIQUE,
        "name" varchar(100) NOT NULL,
        "price_cents" int NOT NULL,
        "included_minutes" int NOT NULL DEFAULT 0,
        "overage_per_min_cents" int NOT NULL DEFAULT 0,
        "features" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO "seat_plans" ("code", "name", "price_cents", "included_minutes", "overage_per_min_cents", "features")
      VALUES
        ('starter', 'Starter', 4900, 200, 25, '["Click-to-call agent dashboard","Compliance gate (DNC + consent checks)","Call logging & dispositions"]'::jsonb),
        ('pro', 'Pro', 8900, 500, 20, '["Everything in Starter","AI call scripts & next-best-action","Call recordings","Team stats"]'::jsonb),
        ('enterprise', 'Enterprise', 14900, -1, 0, '["Everything in Pro","Unlimited preview dialing","Manager console & live-call monitoring","Priority support"]'::jsonb)
      ON CONFLICT ("code") DO NOTHING;
    `);

    // dialer_calls — tenant attribution + post-call disposition.
    await queryRunner.query(`
      ALTER TABLE "dialer_calls" ADD COLUMN IF NOT EXISTS "org_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "dialer_calls" ADD COLUMN IF NOT EXISTS "disposition" varchar(50);
    `);
    await queryRunner.query(`
      ALTER TABLE "dialer_calls" ADD COLUMN IF NOT EXISTS "disposition_at" timestamp;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dialer_calls_org_id" ON "dialer_calls" ("org_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dialer_calls_org_id"`);
    await queryRunner.query(`ALTER TABLE "dialer_calls" DROP COLUMN IF EXISTS "disposition_at"`);
    await queryRunner.query(`ALTER TABLE "dialer_calls" DROP COLUMN IF EXISTS "disposition"`);
    await queryRunner.query(`ALTER TABLE "dialer_calls" DROP COLUMN IF EXISTS "org_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seat_usage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "org_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orgs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seat_plans"`);
    await queryRunner.query(`DROP TYPE IF EXISTS seat_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS seat_tier_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS org_member_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS org_role_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS org_status_enum`);
  }
}
