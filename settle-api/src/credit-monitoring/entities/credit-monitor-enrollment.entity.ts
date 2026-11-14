import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type CreditMonitorProvider = 'mfsn' | 'smartcredit';

export type CreditMonitorStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'unenrolled';

/**
 * Consumer credit-monitoring enrollment — one row per user+provider.
 * `consent` is the FCRA evidence record (grantedAt/method/ip/userAgent/
 * language); NO pull is ever attempted without it.
 */
@Entity('credit_monitor_enrollments')
export class CreditMonitorEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  /** Email the member is enrolled under at the provider (report pull key). */
  @Column({ name: 'member_email', length: 255 })
  memberEmail: string;

  @Column({ type: 'varchar', length: 32, default: 'mfsn' })
  provider: CreditMonitorProvider;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: CreditMonitorStatus;

  /** FCRA consent evidence — required before any pull. */
  @Column({ type: 'jsonb' })
  consent: {
    grantedAt: string;
    method: 'web_form' | 'phone' | 'paper' | 'imported';
    ipAddress?: string;
    userAgent?: string;
    consentLanguage?: string;
  };

  /** Provider-side member reference if the upstream returns one. */
  @Column({ name: 'provider_member_ref', type: 'varchar', length: 255, nullable: true })
  providerMemberRef?: string;

  @Column({ name: 'last_pulled_at', type: 'timestamp', nullable: true })
  lastPulledAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
