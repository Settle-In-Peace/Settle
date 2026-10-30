import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Passkey storage — multi-credential model replacing the single
 * users.passkey_* columns (which only held one device per account).
 * Backfills any existing single credential into the new table.
 */
export class CreateWebAuthnTables1700000000046 implements MigrationInterface {
  name = 'CreateWebAuthnTables1700000000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        credential_id varchar(255) NOT NULL UNIQUE,
        public_key text NOT NULL,
        counter bigint NOT NULL DEFAULT 0,
        transports text[],
        device_name varchar(120),
        backed_up boolean NOT NULL DEFAULT false,
        last_used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials (user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge varchar(255) NOT NULL UNIQUE,
        type varchar(20) NOT NULL,
        user_id uuid,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_challenge ON webauthn_challenges (challenge)`,
    );

    // Backfill legacy single-credential columns → multi-credential table.
    await queryRunner.query(`
      INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
      SELECT id, passkey_credential_id, encode(passkey_public_key, 'base64'), COALESCE(passkey_counter, 0)
      FROM users
      WHERE passkey_credential_id IS NOT NULL
      ON CONFLICT (credential_id) DO NOTHING
    `).catch(() => {
      /* passkey_* columns may not exist on older DBs — fine */
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS webauthn_challenges');
    await queryRunner.query('DROP TABLE IF EXISTS webauthn_credentials');
  }
}
