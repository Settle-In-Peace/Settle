import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentPlanTables1700000000031 implements MigrationInterface {
  name = 'CreatePaymentPlanTables1700000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_plans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "collection_account_id" uuid NOT NULL,
        "crm_client_id" uuid,
        "total_amount" decimal(12,2) NOT NULL,
        "down_payment" decimal(12,2) NOT NULL DEFAULT 0,
        "number_of_payments" int NOT NULL,
        "payment_amount" decimal(12,2) NOT NULL,
        "frequency" varchar(20) NOT NULL DEFAULT 'monthly',
        "start_date" date NOT NULL,
        "end_date" date,
        "next_payment_date" date,
        "payments_made" int NOT NULL DEFAULT 0,
        "total_paid" decimal(12,2) NOT NULL DEFAULT 0,
        "remaining_balance" decimal(12,2) NOT NULL DEFAULT 0,
        "status" varchar(30) NOT NULL DEFAULT 'pending',
        "payment_method" varchar(100),
        "stripe_payment_method_id" varchar(255),
        "auto_pay" boolean NOT NULL DEFAULT false,
        "notes" text,
        "custom_fields" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payment_plans_collection_account_id" ON "payment_plans" ("collection_account_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payment_plans_status" ON "payment_plans" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payment_plans_next_payment_date" ON "payment_plans" ("next_payment_date");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_plan_payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "payment_plan_id" uuid NOT NULL,
        "installment_number" int NOT NULL,
        "scheduled_date" date NOT NULL,
        "amount" decimal(12,2) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'scheduled',
        "paid_date" date,
        "stripe_charge_id" varchar(255),
        "stripe_transaction_id" varchar(255),
        "failure_reason" text,
        "retry_count" int,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payment_plan_payments_payment_plan_id" ON "payment_plan_payments" ("payment_plan_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payment_plan_payments_status" ON "payment_plan_payments" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_payment_plan_payments_scheduled_date" ON "payment_plan_payments" ("scheduled_date");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_plan_payments_scheduled_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_plan_payments_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_plan_payments_payment_plan_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_plan_payments"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_plans_next_payment_date"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payment_plans_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_plans_collection_account_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_plans"`);
  }
}
