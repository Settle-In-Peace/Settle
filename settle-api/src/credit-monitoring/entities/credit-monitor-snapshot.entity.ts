import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CreditMonitorEnrollment } from './credit-monitor-enrollment.entity';

/**
 * One stored credit report pull for an enrollment. `raw` holds the full
 * provider payload (PII) — it is select:false so it is never loaded by
 * default and must NEVER be returned by the API or logged.
 */
@Entity('credit_monitor_snapshots')
export class CreditMonitorSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  @Index()
  enrollmentId: string;

  @ManyToOne(() => CreditMonitorEnrollment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: CreditMonitorEnrollment;

  @Column({ name: 'pulled_at', type: 'timestamp' })
  pulledAt: Date;

  @Column({ type: 'int', nullable: true })
  score?: number;

  @Column({ name: 'score_model', type: 'varchar', length: 64, nullable: true })
  scoreModel?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  bureau?: string;

  @Column({ name: 'tradeline_count', type: 'int', default: 0 })
  tradelineCount: number;

  @Column({ type: 'jsonb', nullable: true })
  tradelines?: Record<string, any>[];

  @Column({ type: 'jsonb', nullable: true })
  inquiries?: Record<string, any>[];

  @Column({ name: 'public_records', type: 'jsonb', nullable: true })
  publicRecords?: Record<string, any>[];

  /** Raw provider payload (PII). Stored for audit; never selected by default,
   *  never logged, never returned to clients. */
  @Column({ type: 'jsonb', nullable: true, select: false })
  raw?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
