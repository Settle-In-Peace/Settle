import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * seat_plans — catalog of per-seat DaaS subscription plans.
 * Seeded by migration 1700000000044:
 *   starter $49/200min · pro $89/500min+scripts+recordings ·
 *   enterprise $149/unlimited preview dial + manager console.
 * `includedMinutes = -1` means unlimited.
 */
@Entity('seat_plans')
export class SeatPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable machine code: 'starter' | 'pro' | 'enterprise'. */
  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'price_cents', type: 'int' })
  priceCents: number;

  /** Included minutes per seat per month; -1 = unlimited. */
  @Column({ name: 'included_minutes', type: 'int', default: 0 })
  includedMinutes: number;

  @Column({ name: 'overage_per_min_cents', type: 'int', default: 0 })
  overagePerMinCents: number;

  @Column('jsonb', { default: [] })
  features: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
