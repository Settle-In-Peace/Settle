import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BYOK skip-trace — orgs may supply their own vendor API key (e.g. BatchData).
 * When set, lookups route through their key and skip platform metering.
 */
export class AddOrgSkiptraceKey1700000000047 implements MigrationInterface {
  name = 'AddOrgSkiptraceKey1700000000047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orgs
      ADD COLUMN IF NOT EXISTS skiptrace_key varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE orgs DROP COLUMN IF EXISTS skiptrace_key`);
  }
}
