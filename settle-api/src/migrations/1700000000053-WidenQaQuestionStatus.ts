import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens qa_questions.status to include 'pending' and makes it the column
 * default. New submissions are moderated before they reach the public feed
 * (matches the app's "appears once reviewed" copy). Applied to prod manually
 * 2026-11-14; kept idempotent for replays/fresh databases.
 */
export class WidenQaQuestionStatus1700000000053 implements MigrationInterface {
  name = 'WidenQaQuestionStatus1700000000053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "qa_questions"
        DROP CONSTRAINT IF EXISTS "qa_questions_status_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "qa_questions"
        ADD CONSTRAINT "qa_questions_status_check"
        CHECK ("status" IN ('pending','published','hidden','answered'));
    `);
    await queryRunner.query(`
      ALTER TABLE "qa_questions"
        ALTER COLUMN "status" SET DEFAULT 'pending';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reject rows that can't fit the old constraint before restoring it.
    await queryRunner.query(`
      UPDATE "qa_questions" SET "status" = 'hidden' WHERE "status" = 'pending';
    `);
    await queryRunner.query(`
      ALTER TABLE "qa_questions"
        DROP CONSTRAINT IF EXISTS "qa_questions_status_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "qa_questions"
        ADD CONSTRAINT "qa_questions_status_check"
        CHECK ("status" IN ('published','hidden','answered'));
    `);
    await queryRunner.query(`
      ALTER TABLE "qa_questions"
        ALTER COLUMN "status" SET DEFAULT 'published';
    `);
  }
}
