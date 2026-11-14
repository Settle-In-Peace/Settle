import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds qa_answers.status — community answers now land 'pending' and only
 * appear publicly after staff review (mirrors qa_questions moderation,
 * migration 53). Existing rows and staff answers default 'published'.
 * Applied to prod manually 2026-12-20; kept idempotent for replays.
 */
export class AddQaAnswerStatus1700000000054 implements MigrationInterface {
  name = 'AddQaAnswerStatus1700000000054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "qa_answers"
        ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'published';
    `);
    await queryRunner.query(`
      ALTER TABLE "qa_answers"
        DROP CONSTRAINT IF EXISTS "qa_answers_status_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "qa_answers"
        ADD CONSTRAINT "qa_answers_status_check"
        CHECK ("status" IN ('pending','published','hidden'));
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_qa_answers_status"
        ON "qa_answers" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_qa_answers_status";`,
    );
    await queryRunner.query(`
      ALTER TABLE "qa_answers" DROP COLUMN IF EXISTS "status";
    `);
  }
}
