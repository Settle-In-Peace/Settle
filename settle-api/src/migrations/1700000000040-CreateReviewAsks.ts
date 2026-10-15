import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewAsks1700000000040 implements MigrationInterface {
  name = 'CreateReviewAsks1700000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_asks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "enrollmentId" uuid NOT NULL,
        "sentAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_asks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_review_asks_enrollment" UNIQUE ("enrollmentId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_review_asks_enrollment" ON "review_asks" ("enrollmentId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "review_asks"`);
  }
}
