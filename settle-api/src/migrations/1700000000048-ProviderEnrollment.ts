import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Provider enrollment pipeline — supports passwordless enrollment via
 * POST /providers/enroll. Enrollees get a providers row with status
 * 'pending_review' and no password; after admin approval they set a
 * password through a one-time emailed setup link.
 *
 *  - password becomes nullable (signup path still always sets one)
 *  - contact_name / fee_structure / plan_interest captured at enrollment
 *  - password_setup_token + password_setup_expires back the setup-link flow
 */
export class ProviderEnrollment1700000000048 implements MigrationInterface {
  name = 'ProviderEnrollment1700000000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE providers
        ALTER COLUMN password DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE providers
        ADD COLUMN IF NOT EXISTS contact_name varchar(150) NULL,
        ADD COLUMN IF NOT EXISTS fee_structure text NULL,
        ADD COLUMN IF NOT EXISTS plan_interest varchar(60) NULL,
        ADD COLUMN IF NOT EXISTS password_setup_token varchar(255) NULL,
        ADD COLUMN IF NOT EXISTS password_setup_expires timestamp NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_providers_password_setup_token
        ON providers (password_setup_token)
        WHERE password_setup_token IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_providers_password_setup_token`);
    await queryRunner.query(`
      ALTER TABLE providers
        DROP COLUMN IF EXISTS contact_name,
        DROP COLUMN IF EXISTS fee_structure,
        DROP COLUMN IF EXISTS plan_interest,
        DROP COLUMN IF EXISTS password_setup_token,
        DROP COLUMN IF EXISTS password_setup_expires
    `);
    // Restore NOT NULL only for rows that actually have a password.
    await queryRunner.query(`
      ALTER TABLE providers ALTER COLUMN password SET NOT NULL
    `);
  }
}
