import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNurtureSubscribers1700000000039 implements MigrationInterface {
  name = 'CreateNurtureSubscribers1700000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nurture_subscribers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "firstName" character varying,
        "source" character varying NOT NULL DEFAULT 'debt-snapshot',
        "snapshot" jsonb,
        "status" character varying NOT NULL DEFAULT 'active',
        "dayIndex" integer NOT NULL DEFAULT 0,
        "nextSendAt" timestamptz NOT NULL,
        "lastSentAt" timestamptz,
        "unsubscribeToken" character varying NOT NULL,
        "consentIp" character varying,
        "consentUserAgent" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_nurture_subscribers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_nurture_subscribers_email" UNIQUE ("email"),
        CONSTRAINT "UQ_nurture_subscribers_token" UNIQUE ("unsubscribeToken")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_nurture_status" ON "nurture_subscribers" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_nurture_next_send" ON "nurture_subscribers" ("nextSendAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "nurture_subscribers"`);
  }
}
