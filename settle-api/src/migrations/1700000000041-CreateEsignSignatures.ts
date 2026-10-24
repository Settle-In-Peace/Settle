import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Self-hosted e-signature audit table (port of Prime's esign_signatures).
 *
 * Each row is an immutable signing event: who signed (user, optional CRM
 * client), what was signed (document id/title/ref), the signed-PDF artifact
 * itself in `signed_pdf` (bytea — settle-api has no object-storage provider,
 * the DB is the artifact store for v1), three SHA-256 fingerprints computed
 * server-side (document descriptor, signed PDF bytes, and a binding audit
 * hash), plus the evidence trail (IP, user agent, server timestamp).
 */
export class CreateEsignSignatures1700000000041 implements MigrationInterface {
  name = 'CreateEsignSignatures1700000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "esign_signatures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "client_id" varchar(64),
        "document_id" varchar(200),
        "document_title" text NOT NULL,
        "document_ref" text,
        "signer_name" varchar(200) NOT NULL,
        "signature_method" varchar(20) NOT NULL DEFAULT 'drawn',
        "signed_pdf" bytea NOT NULL,
        "document_sha256" varchar(64) NOT NULL,
        "signed_pdf_sha256" varchar(64) NOT NULL,
        "audit_sha256" varchar(64) NOT NULL,
        "ip_address" varchar(64),
        "user_agent" text,
        "client_signed_at" timestamptz,
        "signed_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_esign_signatures" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_esign_signatures_user" ON "esign_signatures" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_esign_signatures_client" ON "esign_signatures" ("client_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_esign_signatures_document" ON "esign_signatures" ("document_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "esign_signatures"`);
  }
}
