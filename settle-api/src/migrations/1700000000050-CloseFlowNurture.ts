import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SI close-flow (docs/SI_CLOSE_FLOW.md — shared across sites):
 *   - nurture_sequences: the queued day-0/1/3 SMS+email sequence the
 *     close-flow sweep walks until paid or expired.
 *   - leads.match_fee_paid_at + match_fee_session_id: the family-pays
 *     priority-match fee — stamped by the Stripe webhook and required for
 *     POST /matching/request-contact.
 * Prod applies migrations manually — same SQL was applied to the box DB.
 */
export class CloseFlowNurture1700000000050 implements MigrationInterface {
  name = 'CloseFlowNurture1700000000050';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS nurture_sequences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site varchar(32) NOT NULL,
      lead_ref varchar(128),
      email varchar(255),
      phone varchar(40),
      name varchar(255),
      vertical varchar(64),
      offer varchar(128),
      status varchar(16) NOT NULL DEFAULT 'active',
      step_index int NOT NULL DEFAULT 0,
      next_send_at timestamptz,
      checkout_url text,
      stripe_session_id varchar(128),
      score int,
      grade varchar(2),
      reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
      paid_at timestamptz,
      amount_cents int,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_nurture_due ON nurture_sequences (status, next_send_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_nurture_site ON nurture_sequences (site)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_nurture_session ON nurture_sequences (stripe_session_id) WHERE stripe_session_id IS NOT NULL`);
    await q.query(`ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS match_fee_paid_at timestamp,
      ADD COLUMN IF NOT EXISTS match_fee_session_id varchar(128)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leads
      DROP COLUMN IF EXISTS match_fee_paid_at,
      DROP COLUMN IF EXISTS match_fee_session_id`);
    await q.query(`DROP TABLE IF EXISTS nurture_sequences`);
  }
}
