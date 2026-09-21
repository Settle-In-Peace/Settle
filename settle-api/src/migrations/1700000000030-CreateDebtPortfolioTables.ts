import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDebtPortfolioTables1700000000030 implements MigrationInterface {
  name = 'CreateDebtPortfolioTables1700000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'debt_portfolio_status_enum') THEN
          CREATE TYPE debt_portfolio_status_enum AS ENUM ('purchased', 'active', 'fully_collected', 'written_off', 'archived');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'debt_portfolio_account_status_enum') THEN
          CREATE TYPE debt_portfolio_account_status_enum AS ENUM ('pending_import', 'imported', 'active', 'collected', 'partial_payment', 'settlement_pending', 'settled', 'written_off', 'bankruptcy', 'deceased');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debt_portfolios" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "portfolio_name" varchar(255) NOT NULL,
        "seller_name" varchar(255) NOT NULL,
        "seller_contact_info" varchar(255) NOT NULL,
        "purchase_date" date NOT NULL,
        "purchase_price" decimal(14,2) NOT NULL DEFAULT 0,
        "total_face_value" decimal(14,2) NOT NULL DEFAULT 0,
        "account_count" int NOT NULL DEFAULT 0,
        "status" debt_portfolio_status_enum NOT NULL DEFAULT 'purchased',
        "purchase_price_per_cent" decimal(10,4) NOT NULL DEFAULT 0,
        "contract_document_url" varchar(1024),
        "notes" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debt_portfolios_status" ON "debt_portfolios" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "debt_portfolio_accounts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "portfolio_id" uuid NOT NULL,
        "collection_account_id" uuid,
        "original_creditor" varchar(255) NOT NULL,
        "original_account_number" varchar(255) NOT NULL,
        "debtor_name" varchar(255) NOT NULL,
        "debtor_phone" varchar(30),
        "debtor_email" varchar(255),
        "debtor_address" varchar(512),
        "debtor_state" varchar(2) NOT NULL,
        "face_value" decimal(14,2) NOT NULL DEFAULT 0,
        "purchase_price" decimal(14,2) NOT NULL DEFAULT 0,
        "status" debt_portfolio_account_status_enum NOT NULL DEFAULT 'pending_import',
        "total_collected" decimal(14,2) NOT NULL DEFAULT 0,
        "last_payment_date" date,
        "charge_off_date" date,
        "last_activity_date" date,
        "statute_of_limitations_date" date,
        "import_data" jsonb NOT NULL DEFAULT '{}',
        "custom_fields" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debt_portfolio_accounts_portfolio_id" ON "debt_portfolio_accounts" ("portfolio_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debt_portfolio_accounts_status" ON "debt_portfolio_accounts" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debt_portfolio_accounts_debtor_state" ON "debt_portfolio_accounts" ("debtor_state");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_debt_portfolio_accounts_collection_account_id" ON "debt_portfolio_accounts" ("collection_account_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debt_portfolio_accounts_collection_account_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debt_portfolio_accounts_debtor_state"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debt_portfolio_accounts_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debt_portfolio_accounts_portfolio_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "debt_portfolio_accounts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_debt_portfolios_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "debt_portfolios"`);
    await queryRunner.query(`DROP TYPE IF EXISTS debt_portfolio_account_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS debt_portfolio_status_enum`);
  }
}
