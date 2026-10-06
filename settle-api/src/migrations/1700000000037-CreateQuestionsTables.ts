import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the anonymous Q&A board tables used by the questions module
 * (settle-api/src/questions):
 *
 *   qa_questions — one row per anonymous question. author_user_id and
 *                  contact_email are internal-only (never returned publicly);
 *                  answers_count is denormalized and recounted on insert.
 *   qa_answers   — community/staff answers; cascade-deletes with the
 *                  question. is_official marks verified Settle-team answers.
 */
export class CreateQuestionsTables1700000000037 implements MigrationInterface {
  name = 'CreateQuestionsTables1700000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "qa_questions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "body" text NOT NULL,
        "category" varchar(30) NOT NULL DEFAULT 'other'
          CHECK ("category" IN ('probate','debts','taxes','property','family','other')),
        "status" varchar(20) NOT NULL DEFAULT 'published'
          CHECK ("status" IN ('published','hidden','answered')),
        "answers_count" int NOT NULL DEFAULT 0,
        "author_user_id" uuid,
        "contact_email" varchar(255),
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_qa_questions_status"
        ON "qa_questions" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_qa_questions_category"
        ON "qa_questions" ("category");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "qa_answers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "question_id" uuid NOT NULL REFERENCES "qa_questions"("id") ON DELETE CASCADE,
        "body" text NOT NULL,
        "is_official" boolean NOT NULL DEFAULT false,
        "author_label" varchar(60) NOT NULL DEFAULT 'Community member',
        "author_user_id" uuid,
        "contact_email" varchar(255),
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_qa_answers_question_id"
        ON "qa_answers" ("question_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "qa_answers";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "qa_questions";`);
  }
}
