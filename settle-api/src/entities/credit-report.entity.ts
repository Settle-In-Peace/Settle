import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CreditReportStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  MANUAL = 'manual',
}

export enum CreditReportProvider {
  EQUIFAX = 'equifax',
  EXPERIAN = 'experian',
  TRANSUNION = 'transunion',
  MYFREESCORENOW = 'myfreescorenow',
  MANUAL = 'manual',
}

@Entity('credit_reports')
export class CreditReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'collection_account_id' })
  @Index()
  collectionAccountId: string;

  @Column({
    type: 'enum',
    enum: CreditReportProvider,
    default: CreditReportProvider.MANUAL,
  })
  provider: CreditReportProvider;

  @Column({
    type: 'enum',
    enum: CreditReportStatus,
    default: CreditReportStatus.MANUAL,
  })
  status: CreditReportStatus;

  @Column('jsonb', { name: 'request_payload', nullable: true })
  requestPayload?: Record<string, any>;

  @Column({ name: 'credit_score', type: 'int', nullable: true })
  creditScore?: number;

  @Column({ name: 'report_date', type: 'date', nullable: true })
  reportDate?: string;

  @Column('jsonb', { nullable: true })
  accounts?: {
    creditorName?: string;
    accountNumber?: string;
    balance?: number;
    status?: string;
    openedDate?: string;
    lastReported?: string;
  }[];

  @Column('jsonb', { nullable: true })
  inquiries?: {
    inquiryDate?: string;
    creditorName?: string;
    type?: string;
  }[];

  @Column('jsonb', { name: 'public_records', nullable: true })
  publicRecords?: {
    type?: string;
    amount?: number;
    dateFiled?: string;
    dateResolved?: string;
  }[];

  @Column('jsonb', { nullable: true })
  warnings?: string[];

  @Column('jsonb', { name: 'raw_response', nullable: true })
  rawResponse?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
