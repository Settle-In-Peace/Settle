import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SequenceStatus } from './close-flow.types';

/**
 * nurture_sequences — the shared close-flow table. Same DDL on every site
 * (see docs/SI_CLOSE_FLOW.md; supabase/migrations carries the .sql copy).
 * `status`/`grade` are varchar (not pg enums) so new values never need an
 * ALTER TYPE.
 */
@Entity('nurture_sequences')
export class NurtureSequence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  @Index()
  site: string;

  @Column({ name: 'lead_ref', type: 'varchar', length: 128, nullable: true })
  leadRef?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vertical?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  offer?: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  @Index()
  status: SequenceStatus;

  @Column({ name: 'step_index', type: 'int', default: 0 })
  stepIndex: number;

  @Column({ name: 'next_send_at', type: 'timestamptz', nullable: true })
  @Index()
  nextSendAt?: Date;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl?: string;

  @Column({ name: 'stripe_session_id', type: 'varchar', length: 128, nullable: true })
  stripeSessionId?: string;

  @Column({ type: 'int', nullable: true })
  score?: number;

  @Column({ type: 'varchar', length: 2, nullable: true })
  grade?: string;

  @Column({ type: 'jsonb', default: [] })
  reasons?: string[];

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date;

  @Column({ name: 'amount_cents', type: 'int', nullable: true })
  amountCents?: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
