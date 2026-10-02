import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LeadPurchaseStatus {
  PENDING = 'pending',
  PINGED = 'pinged',
  POSTED = 'posted',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

/**
 * An outbound lead-buying transaction with a vendor — a bulk order call or a
 * ping/post exchange. The leads delivered are tracked via the linked import
 * batch (`import_batch_id` → lead_import_batches).
 */
@Entity('lead_purchases')
export class LeadPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_name', length: 100 })
  @Index()
  vendorName: string;

  /** Lead criteria sent to the vendor (states, debt range, types…). */
  @Column('jsonb', { nullable: true })
  criteria?: Record<string, any>;

  @Column({ name: 'quantity_requested', type: 'int', default: 0 })
  quantityRequested: number;

  @Column({ name: 'quantity_received', type: 'int', default: 0 })
  quantityReceived: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    name: 'price_per_lead',
    nullable: true,
  })
  pricePerLead?: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'total_cost',
    nullable: true,
  })
  totalCost?: number;

  @Column({
    type: 'enum',
    enum: LeadPurchaseStatus,
    default: LeadPurchaseStatus.PENDING,
  })
  status: LeadPurchaseStatus;

  /** Vendor-side ping/transaction id (ping phase). */
  @Column({ name: 'vendor_ping_id', length: 255, nullable: true })
  vendorPingId?: string;

  /** Vendor-side post/order id (post phase). */
  @Column({ name: 'vendor_post_id', length: 255, nullable: true })
  vendorPostId?: string;

  /** Import batch holding the delivered leads, once created. */
  @Column({ name: 'import_batch_id', type: 'uuid', nullable: true })
  @Index()
  importBatchId?: string;

  @Column('jsonb', { name: 'raw_response', nullable: true })
  rawResponse?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  error?: string;

  /** Staff user who initiated the purchase. */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
