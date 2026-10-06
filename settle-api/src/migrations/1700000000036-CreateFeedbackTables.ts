import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the feature-request board tables used by the feedback module
 * (settle-api/src/feedback):
 *
 *   feature_requests       — one row per suggestion; `votes` is a
 *                            denormalized counter recounted from votes table.
 *   feature_request_votes  — one row per (request_id, voter_id) pair;
 *                            cascade-deletes with the request.
 */
export class CreateFeedbackTables1700000000036 implements MigrationInterface {
  name = 'CreateFeedbackTables1700000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feature_requests" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "title" varchar(160) NOT NULL,
        "body" text,
        "category" varchar(50) NOT NULL DEFAULT 'general',
        "status" varchar(20) NOT NULL DEFAULT 'under_review'
          CHECK ("status" IN ('under_review','planned','in_progress','shipped','declined')),
        "votes" int NOT NULL DEFAULT 0,
        "author_name" varchar(120),
        "author_email" varchar(255),
        "author_user_id" uuid,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_feature_requests_status"
        ON "feature_requests" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_feature_requests_author_user_id"
        ON "feature_requests" ("author_user_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feature_request_votes" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "request_id" uuid NOT NULL REFERENCES "feature_requests"("id") ON DELETE CASCADE,
        "voter_id" varchar(128) NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "uq_feature_request_votes_request_voter"
          UNIQUE ("request_id", "voter_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_feature_request_votes_request_id"
        ON "feature_request_votes" ("request_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_request_votes";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_requests";`);
  }
}
