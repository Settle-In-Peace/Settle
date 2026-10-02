import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ProcessorPaymentStatus {
  APPROVED = 'approved',
  DECLINED = 'declined',
  VOIDED = 'voided',
  REFUNDED = 'refunded',
  ERROR = 'error',
  PENDING = 'pending',
}

export enum ProcessorPaymentType {
  SALE = 'sale',
  REFUND = 'refund',
  VOID = 'void',
  RECURRING_SALE = 'recurring_sale',
}

/**
 * High-risk payment processor transaction record.
 *
 * PCI: stores card_brand + card_last4 ONLY. PAN/CVV/expiry never reach this
 * table (charges run on single-use processor tokens — see
 * payment-processors/payment-processor.utils.ts assertNoSensitiveCardData).
 *
 * FDCPA/state compliance: `permitted`, `disclosure_text`, and
 * `disclosure_acknowledged_at` record that the debtor saw and acknowledged
 * the applicable disclosure (convenience-fee rules differ by state).
 */
@Entity('processor_payments')
export class ProcessorPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Debtor link — the crm_clients row the account belongs to. */
  @Column({ name: 'debtor_id', nullable: true })
  @Index()
  debtorId?: string;

  @Column({ name: 'collection_account_id', nullable: true })
  @Index()
  collectionAccountId?: string;

  @Column({ name: 'debt_id', nullable: true })
  @Index()
  debtId?: string;

  @Column({ name: 'payment_plan_id', nullable: true })
  paymentPlanId?: string;

  /** For refund/void records — links back to the original sale row. */
  @Column({ name: 'parent_payment_id', nullable: true })
  parentPaymentId?: string;

  @Column({ length: 32 })
  processor: string; // 'nmi' | 'authorizenet' | 'stripe'

  @Column({
    type: 'enum',
    enum: ProcessorPaymentType,
    default: ProcessorPaymentType.SALE,
  })
  type: ProcessorPaymentType;

  @Column({
    type: 'enum',
    enum: ProcessorPaymentStatus,
    default: ProcessorPaymentStatus.PENDING,
  })
  status: ProcessorPaymentStatus;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ length: 3, default: 'usd' })
  currency: string;

  @Column({ name: 'convenience_fee_cents', type: 'int', default: 0 })
  convenienceFeeCents: number;

  @Column({ name: 'processor_txn_id', length: 255, nullable: true })
  @Index()
  processorTxnId?: string;

  // ── Raw gateway codes (audit; never PAN) ──────────────────────────────
  @Column({ name: 'auth_code', length: 64, nullable: true })
  authCode?: string;

  @Column({ name: 'response_code', length: 16, nullable: true })
  responseCode?: string;

  @Column({ name: 'response_text', length: 255, nullable: true })
  responseText?: string;

  @Column({ name: 'avs_response', length: 8, nullable: true })
  avsResponse?: string;

  @Column({ name: 'cvv_response', length: 8, nullable: true })
  cvvResponse?: string;

  // ── Card metadata ONLY (never PAN/expiry/CVV) ─────────────────────────
  @Column({ name: 'card_brand', length: 32, nullable: true })
  cardBrand?: string;

  @Column({ name: 'card_last4', length: 4, nullable: true })
  cardLast4?: string;

  // ── Recurring / vault links ────────────────────────────────────────────
  @Column({ name: 'customer_vault_id', length: 255, nullable: true })
  customerVaultId?: string;

  @Column({ name: 'recurring_plan_id', length: 255, nullable: true })
  recurringPlanId?: string;

  // ── FDCPA / state convenience-fee compliance ──────────────────────────
  /** Charge was permitted under the disclosed terms (fail-closed default). */
  @Column({ default: false })
  permitted: boolean;

  /** Disclosure text shown to the debtor at time of charge. */
  @Column({ name: 'disclosure_text', type: 'text', nullable: true })
  disclosureText?: string;

  @Column({
    name: 'disclosure_acknowledged_at',
    type: 'timestamp',
    nullable: true,
  })
  disclosureAcknowledgedAt?: Date;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  /** Staff user who initiated the charge (null for portal/self-serve). */
  @Column({ name: 'initiated_by', nullable: true })
  initiatedBy?: string;

  /** Idempotency — a duplicate POST returns the existing record. */
  @Column({ name: 'idempotency_key', length: 128, nullable: true })
  idempotencyKey?: string;

  /** Sanitized gateway response (PAN-bearing keys stripped). */
  @Column('jsonb', { name: 'raw_response', nullable: true })
  rawResponse?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
