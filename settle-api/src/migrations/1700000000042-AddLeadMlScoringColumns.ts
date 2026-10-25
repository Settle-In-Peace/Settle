import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeadMlScoringColumns1700000000042 implements MigrationInterface {
  name = 'AddLeadMlScoringColumns1700000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The Lead entity gained mlScore / mlFactors / mlTier when ML lead scoring
    // shipped (commit d51609f) but no migration ever created the columns, so
    // every successful-scored /leads/assessment INSERT 500'd in production.
    // simple-json maps to a plain text column; IF NOT EXISTS keeps this
    // idempotent with any out-of-band hotfix applied to prod.
    await queryRunner.query(`
      ALTER TABLE "leads"
      ADD COLUMN IF NOT EXISTS "mlScore" int,
      ADD COLUMN IF NOT EXISTS "mlFactors" text,
      ADD COLUMN IF NOT EXISTS "mlTier" varchar(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leads"
      DROP COLUMN IF EXISTS "mlTier",
      DROP COLUMN IF EXISTS "mlFactors",
      DROP COLUMN IF EXISTS "mlScore"
    `);
  }
}
