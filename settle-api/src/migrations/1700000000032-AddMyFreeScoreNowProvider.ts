import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMyFreeScoreNowProvider1700000000032 implements MigrationInterface {
  name = 'AddMyFreeScoreNowProvider1700000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'myfreescorenow' to the existing credit_report_provider_enum
    await queryRunner.query(`
      ALTER TYPE credit_report_provider_enum
      ADD VALUE IF NOT EXISTS 'myfreescorenow'
      BEFORE 'manual'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing individual enum values directly.
    // To revert, the enum type would need to be recreated.
    // This is safe to leave as-is since 'myfreescorenow' is unused if rolled back.
  }
}
