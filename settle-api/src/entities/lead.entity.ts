import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Consumer info (can be anonymous before signup)
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId?: string;

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'varchar', length: 100 })
  email!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 2 })
  state!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  zipCode?: string;

  // Debt situation
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalDebt!: number;

  @Column({ type: 'simple-array', nullable: true })
  debtTypes?: string[]; // credit_card, medical, personal_loan, etc.

  @Column({ type: 'varchar', length: 50, nullable: true })
  employmentStatus?: string; // employed, self_employed, unemployed, retired

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthlyIncome?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  creditScore?: string; // poor, fair, good, very_good (range bucket)

  @Column({ type: 'int', nullable: true })
  monthsBehind?: number; // months behind on payments

  @Column({ type: 'boolean', default: false })
  hasFiledBankruptcy!: boolean;

  // Lead quality
  @Column({ type: 'int', default: 0 })
  qualityScore!: number; // 0-100

  @Column({ type: 'varchar', length: 20, nullable: true })
  qualityTier?: string; // premium, qualified, standard, low

  // ML-enhanced lead scoring
  @Column({ type: 'int', nullable: true })
  mlScore?: number;

  @Column({ type: 'simple-json', nullable: true })
  mlFactors?: Record<string, number>;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mlTier?: string;

  @Column({ type: 'boolean', default: false })
  isVerified!: boolean;

  // Lead status & marketplace
  @Column({ type: 'varchar', length: 50, default: 'new' })
  status!: string; // new, available, sold, converted, rejected, expired

  @Column({ type: 'uuid', name: 'purchased_by', nullable: true })
  purchasedBy?: string; // provider ID who bought this lead

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  salePrice?: number;

  @Column({ type: 'timestamp', nullable: true })
  purchasedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  // Consent — full audit trail required for TCPA compliance. Every lead must
  // have a verifiable record of what the consumer agreed to, when, from where,
  // and on what device/page version. Forcing consent to true without these
  // fields creates litigation exposure.
  @Column({ type: 'boolean', default: false })
  tcpaConsent!: boolean;

  @Column({ type: 'text', nullable: true })
  consentLanguage?: string;

  @Column({ type: 'varchar', length: 64, name: 'consent_ip', nullable: true })
  consentIp?: string;

  @Column({ type: 'varchar', length: 512, name: 'consent_user_agent', nullable: true })
  consentUserAgent?: string;

  @Column({ type: 'varchar', length: 64, name: 'consent_page_version', nullable: true })
  consentPageVersion?: string;

  @Column({ type: 'timestamp', nullable: true })
  consentTimestamp?: Date;

  // Source tracking
  @Column({ type: 'varchar', length: 100, nullable: true })
  source?: string; // organic, paid_search, social, referral

  @Column({ type: 'varchar', length: 200, nullable: true })
  utm?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Sales / CRM
  @Column({ type: 'uuid', name: 'sales_agent_id', nullable: true })
  salesAgentId?: string;

  @Column({ type: 'text', name: 'sales_notes', nullable: true })
  salesNotes?: string;

  @Column({ type: 'timestamp', name: 'converted_at', nullable: true })
  convertedAt?: Date;

  @Column({ type: 'timestamp', name: 'sales_agent_assigned_at', nullable: true })
  salesAgentAssignedAt?: Date;

  @Column({ type: 'timestamp', name: 'follow_up_date', nullable: true })
  followUpDate?: Date;

  @Column({ type: 'timestamp', name: 'last_contacted_at', nullable: true })
  lastContactedAt?: Date;

  // ── Lead vendor sourcing (set only for purchased/imported vendor leads) ──
  @Column({ type: 'varchar', length: 100, name: 'vendor_name', nullable: true })
  vendorName?: string; // which external vendor supplied this lead

  @Column({ type: 'varchar', length: 255, name: 'vendor_lead_id', nullable: true })
  vendorLeadId?: string; // vendor-side lead id for support/reconciliation

  @Column({ type: 'uuid', name: 'import_batch_id', nullable: true })
  importBatchId?: string; // → lead_import_batches.id

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'purchase_cost', nullable: true })
  purchaseCost?: number; // what we paid the vendor for this lead

  @Column({ type: 'simple-json', name: 'score_factors', nullable: true })
  scoreFactors?: Record<string, unknown>; // transparent scoring breakdown

  @Column({ type: 'uuid', name: 'duplicate_of', nullable: true })
  duplicateOf?: string; // set when dedupe matched an existing lead row

  @Column({ type: 'uuid', name: 'collection_account_id', nullable: true })
  collectionAccountId?: string; // handoff link after assign-to-collections
}