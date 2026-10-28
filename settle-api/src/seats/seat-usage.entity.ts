import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * seat_usage — monthly rollup per seat, synced from `dialer_calls`
 * (calls placed by the seat's user within the org). Kept as a persisted
 * table (rather than pure on-read computation) so billing periods have a
 * stable system of record; `lastSyncedAt` records when the row was last
 * recomputed.
 *
 * rpc_count = right-party-contact count (answered/completed calls or an
 * explicit 'rpc'-family disposition).
 */
@Entity('seat_usage')
@Unique(['seatId', 'period'])
export class SeatUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'seat_id' })
  seatId: string;

  /** Denormalized for org-level rollups without joining seats. */
  @Column({ name: 'org_id' })
  orgId: string;

  /** Billing period, 'YYYY-MM'. */
  @Column({ length: 7 })
  period: string;

  @Column({ name: 'minutes_used', type: 'int', default: 0 })
  minutesUsed: number;

  @Column({ name: 'calls_placed', type: 'int', default: 0 })
  callsPlaced: number;

  @Column({ name: 'rpc_count', type: 'int', default: 0 })
  rpcCount: number;

  /** Minutes beyond the seat's monthlyMinutesIncluded — tracked, not blocked. */
  @Column({ name: 'overage_minutes', type: 'int', default: 0 })
  overageMinutes: number;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
