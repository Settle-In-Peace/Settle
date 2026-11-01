import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDirectoryFields1700000000049 implements MigrationInterface {
  name = 'AddDirectoryFields1700000000049';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE providers
      ADD COLUMN IF NOT EXISTS slug varchar(255),
      ADD COLUMN IF NOT EXISTS listing_active boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS featured_tier varchar(20),
      ADD COLUMN IF NOT EXISTS featured_regions text,
      ADD COLUMN IF NOT EXISTS featured_until timestamp,
      ADD COLUMN IF NOT EXISTS directory_views int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS directory_clicks int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bar_number varchar(60),
      ADD COLUMN IF NOT EXISTS city varchar(120)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_slug ON providers(slug) WHERE slug IS NOT NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_providers_listing ON providers(listing_active) WHERE listing_active`);
    // match_reason on leads for audit (bk_candidate vs settlement_fit)
    await q.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS match_reason varchar(40)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE providers
      DROP COLUMN IF EXISTS slug, DROP COLUMN IF EXISTS listing_active,
      DROP COLUMN IF EXISTS featured_tier, DROP COLUMN IF EXISTS featured_regions,
      DROP COLUMN IF EXISTS featured_until, DROP COLUMN IF EXISTS directory_views,
      DROP COLUMN IF EXISTS directory_clicks, DROP COLUMN IF EXISTS bar_number,
      DROP COLUMN IF EXISTS city`);
    await q.query(`ALTER TABLE leads DROP COLUMN IF EXISTS match_reason`);
  }
}
