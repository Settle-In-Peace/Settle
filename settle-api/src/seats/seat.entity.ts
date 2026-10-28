import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SeatTier {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum SeatStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  RELEASED = 'released',
}

/**
 * seats — a per-user DaaS dialing license inside an org. One active seat
 * per (org_id, user_id) — enforced by a partial unique index created in
 * migration 1700000000044. Released seats keep their row for audit.
 */
@Entity('seats')
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id' })
  @Index()
  orgId: string;

  /** users.id — the agent this seat is assigned to. */
  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: SeatTier,
    enumName: 'seat_tier_enum',
    name: 'seat_tier',
    default: SeatTier.STARTER,
  })
  seatTier: SeatTier;

  /** Included monthly minutes copied from the plan at assign time. */
  @Column({ name: 'monthly_minutes_included', type: 'int', default: 0 })
  monthlyMinutesIncluded: number;

  @Column({
    type: 'enum',
    enum: SeatStatus,
    enumName: 'seat_status_enum',
    default: SeatStatus.ACTIVE,
  })
  @Index()
  status: SeatStatus;

  /** users.id of whoever assigned the seat. */
  @Column({ name: 'assigned_by', nullable: true })
  assignedBy?: string;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt?: Date;

  @Column({ name: 'released_at', type: 'timestamp', nullable: true })
  releasedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
