import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameLeadPurchasedByColumn1700000000043 implements MigrationInterface {
  name = 'RenameLeadPurchasedByColumn1700000000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migration 0004 created the column as "purchasedBy" (camelCase) while the
    // Lead entity maps it to purchased_by — every TypeORM SELECT on leads
    // referenced a non-existent column, so /leads/assessment and
    // /matching/recommended 500'd in production. Rename aligns the DB with
    // the entity; the index on the column follows automatically.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'purchasedBy'
        ) THEN
          ALTER TABLE "leads" RENAME COLUMN "purchasedBy" TO "purchased_by";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'purchased_by'
        ) THEN
          ALTER TABLE "leads" RENAME COLUMN "purchased_by" TO "purchasedBy";
        END IF;
      END $$;
    `);
  }
}
