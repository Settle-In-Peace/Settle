import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDirectoryClickTargets1700000000056 implements MigrationInterface {
  name = 'AddDirectoryClickTargets1700000000056';

  public async up(q: QueryRunner): Promise<void> {
    // Per-target click counters alongside the aggregate directory_clicks so
    // listing-stats can tell website click-throughs from phone taps.
    await q.query(`ALTER TABLE providers
      ADD COLUMN IF NOT EXISTS directory_website_clicks int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS directory_phone_clicks int NOT NULL DEFAULT 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE providers
      DROP COLUMN IF EXISTS directory_website_clicks,
      DROP COLUMN IF EXISTS directory_phone_clicks`);
  }
}
