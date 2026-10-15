import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface DebtSnapshot {
  totalDebt: number;
  debtCount: number;
  monthlyMinimums: number;
  payoffMonths: number | null;
  payoffInterest: number | null;
  estSettlementCost: number;
  estSavings: number;
  estMonthlyDeposit: number;
}

export type NurtureStatus = 'active' | 'done' | 'unsubscribed';

@Entity('nurture_subscribers')
export class NurtureSubscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index({ unique: true })
  email: string;

  @Column({ nullable: true })
  firstName: string | null;

  @Column({ default: 'debt-snapshot' })
  source: string;

  @Column('jsonb', { nullable: true })
  snapshot: DebtSnapshot | null;

  @Column({ default: 'active' })
  @Index()
  status: NurtureStatus;

  /** How many sequence emails have been sent (0–7). */
  @Column({ default: 0 })
  dayIndex: number;

  @Column({ type: 'timestamptz' })
  @Index()
  nextSendAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSentAt: Date | null;

  @Column()
  @Index({ unique: true })
  unsubscribeToken: string;

  @Column({ nullable: true })
  consentIp: string | null;

  @Column({ type: 'text', nullable: true })
  consentUserAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
