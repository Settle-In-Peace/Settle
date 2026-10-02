import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProcessorPaymentsTable1700000000034
  implements MigrationInterface
{
  name = 'CreateProcessorPaymentsTable1700000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "processor_payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "debtor_id" uuid,
        "collection_account_id" uuid,
        "debt_id" uuid,
        "payment_plan_id" uuid,
        "parent_payment_id" uuid,
        "processor" varchar(32) NOT NULL,
        "type" varchar(30) NOT NULL DEFAULT 'sale',
        "status" varchar(30) NOT NULL DEFAULT 'pending',
        "amount_cents" int NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'usd',
        "convenience_fee_cents" int NOT NULL DEFAULT 0,
        "processor_txn_id" varchar(255),
        "auth_code" varchar(64),
        "response_code" varchar(16),
        "response_text" varchar(255),
        "avs_response" varchar(8),
        "cvv_response" varchar(8),
        "card_brand" varchar(32),
        "card_last4" varchar(4),
        "customer_vault_id" varchar(255),
        "recurring_plan_id" varchar(255),
        "permitted" boolean NOT NULL DEFAULT false,
        "disclosure_text" text,
        "disclosure_acknowledged_at" timestamp,
        "failure_reason" text,
        "initiated_by" uuid,
        "idempotency_key" varchar(128),
        "raw_response" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_processor_payments_debtor_id"
        ON "processor_payments" ("debtor_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_processor_payments_collection_account_id"
        ON "processor_payments" ("collection_account_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_processor_payments_debt_id"
        ON "processor_payments" ("debt_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_processor_payments_processor_txn_id"
        ON "processor_payments" ("processor_txn_id");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_processor_payments_idempotency_key"
        ON "processor_payments" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_processor_payments_idempotency_key"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_processor_payments_processor_txn_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_processor_payments_debt_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_processor_payments_collection_account_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_processor_payments_debtor_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "processor_payments"`);
  }
}
