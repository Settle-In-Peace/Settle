import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeadVendorTables1700000000033 implements MigrationInterface {
  name = 'CreateLeadVendorTables1700000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_vendor_type_enum') THEN
          CREATE TYPE lead_vendor_type_enum AS ENUM ('ping_post', 'webhook', 'file_import');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_import_batch_source_enum') THEN
          CREATE TYPE lead_import_batch_source_enum AS ENUM ('webhook', 'csv', 'ping_post', 'api_order');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_import_batch_status_enum') THEN
          CREATE TYPE lead_import_batch_status_enum AS ENUM ('processing', 'completed', 'failed');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_purchase_status_enum') THEN
          CREATE TYPE lead_purchase_status_enum AS ENUM ('pending', 'pinged', 'posted', 'completed', 'rejected', 'failed');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lead_vendor_accounts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "vendor_name" varchar(100) NOT NULL UNIQUE,
        "display_name" varchar(200),
        "vendor_type" lead_vendor_type_enum NOT NULL DEFAULT 'ping_post',
        "is_active" boolean NOT NULL DEFAULT true,
        "api_key_ref" varchar(200),
        "webhook_secret_ref" varchar(200),
        "default_price" decimal(10,2),
        "config" jsonb,
        "notes" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lead_import_batches" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "vendor_name" varchar(100) NOT NULL,
        "source" lead_import_batch_source_enum NOT NULL DEFAULT 'csv',
        "filename" varchar(500),
        "status" lead_import_batch_status_enum NOT NULL DEFAULT 'processing',
        "total_rows" int NOT NULL DEFAULT 0,
        "imported" int NOT NULL DEFAULT 0,
        "duplicates" int NOT NULL DEFAULT 0,
        "invalid" int NOT NULL DEFAULT 0,
        "total_cost" decimal(12,2),
        "row_errors" jsonb,
        "created_by" uuid,
        "error" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lead_purchases" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "vendor_name" varchar(100) NOT NULL,
        "criteria" jsonb,
        "quantity_requested" int NOT NULL DEFAULT 0,
        "quantity_received" int NOT NULL DEFAULT 0,
        "price_per_lead" decimal(10,2),
        "total_cost" decimal(12,2),
        "status" lead_purchase_status_enum NOT NULL DEFAULT 'pending',
        "vendor_ping_id" varchar(255),
        "vendor_post_id" varchar(255),
        "import_batch_id" uuid,
        "raw_response" jsonb,
        "error" text,
        "created_by" uuid,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    // Source-tracking columns on the existing leads table — imported/purchased
    // vendor leads live in `leads` alongside consumer assessment leads so the
    // sales/collections pipeline treats them uniformly.
    await queryRunner.query(`
      ALTER TABLE "leads"
      ADD COLUMN IF NOT EXISTS "vendor_name" varchar(100),
      ADD COLUMN IF NOT EXISTS "vendor_lead_id" varchar(255),
      ADD COLUMN IF NOT EXISTS "import_batch_id" uuid,
      ADD COLUMN IF NOT EXISTS "purchase_cost" decimal(10,2),
      ADD COLUMN IF NOT EXISTS "score_factors" json,
      ADD COLUMN IF NOT EXISTS "duplicate_of" uuid,
      ADD COLUMN IF NOT EXISTS "collection_account_id" uuid
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_leads_vendor_name" ON "leads" ("vendor_name")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_leads_import_batch_id" ON "leads" ("import_batch_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_leads_dedupe_phone" ON "leads" ("phone")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_leads_dedupe_email" ON "leads" ("email")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_lead_import_batches_vendor" ON "lead_import_batches" ("vendor_name")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_lead_purchases_vendor" ON "lead_purchases" ("vendor_name")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_lead_purchases_batch" ON "lead_purchases" ("import_batch_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lead_purchases_batch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lead_purchases_vendor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lead_import_batches_vendor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_leads_dedupe_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_leads_dedupe_phone"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_leads_import_batch_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_leads_vendor_name"`);
    await queryRunner.query(`
      ALTER TABLE "leads"
      DROP COLUMN IF EXISTS "collection_account_id",
      DROP COLUMN IF EXISTS "duplicate_of",
      DROP COLUMN IF EXISTS "score_factors",
      DROP COLUMN IF EXISTS "purchase_cost",
      DROP COLUMN IF EXISTS "import_batch_id",
      DROP COLUMN IF EXISTS "vendor_lead_id",
      DROP COLUMN IF EXISTS "vendor_name"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "lead_purchases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lead_import_batches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lead_vendor_accounts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_purchase_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_import_batch_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_import_batch_source_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_vendor_type_enum`);
  }
}
