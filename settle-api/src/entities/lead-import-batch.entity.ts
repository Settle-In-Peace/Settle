import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LeadImportBatchSource {
  WEBHOOK = 'webhook',
  CSV = 'csv',
  PING_POST = 'ping_post',
  API_ORDER = 'api_order',
}

export enum LeadImportBatchStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * One inbound delivery of leads from a vendor — a webhook post, a CSV upload,
 * or the leads returned by a purchase/order call. Individual lead rows link
 * back via leads.import_batch_id; duplicate rows are counted (and linked via
 * leads.duplicate_of) rather than re-created.
 */
@Entity('lead_import_batches')
export class LeadImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_name', length: 100 })
  @Index()
  vendorName: string;

  @Column({
    type: 'enum',
    enum: LeadImportBatchSource,
    default: LeadImportBatchSource.CSV,
  })
  source: LeadImportBatchSource;

  /** Original filename for CSV imports; remote batch/ref id for vendor posts. */
  @Column({ length: 500, nullable: true })
  filename?: string;

  @Column({
    type: 'enum',
    enum: LeadImportBatchStatus,
    default: LeadImportBatchStatus.PROCESSING,
  })
  status: LeadImportBatchStatus;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ type: 'int', default: 0 })
  imported: number;

  @Column({ type: 'int', default: 0 })
  duplicates: number;

  @Column({ type: 'int', default: 0 })
  invalid: number;

  /** Total paid for leads delivered in this batch, when known. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'total_cost',
    nullable: true,
  })
  totalCost?: number;

  /** Per-row skip reasons for the first ~50 bad rows (debug aid). */
  @Column('jsonb', { name: 'row_errors', nullable: true })
  rowErrors?: { row: number; reason: string }[];

  /** Staff user who ran a CSV import; null for webhook/vendor-initiated. */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
