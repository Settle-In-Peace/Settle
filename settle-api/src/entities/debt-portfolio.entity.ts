import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CollectionAccount } from './collection-account.entity';

export enum DebtPortfolioStatus {
  PURCHASED = 'purchased',
  ACTIVE = 'active',
  FULLY_COLLECTED = 'fully_collected',
  WRITTEN_OFF = 'written_off',
  ARCHIVED = 'archived',
}

export enum DebtPortfolioAccountStatus {
  PENDING_IMPORT = 'pending_import',
  IMPORTED = 'imported',
  ACTIVE = 'active',
  COLLECTED = 'collected',
  PARTIAL_PAYMENT = 'partial_payment',
  SETTLEMENT_PENDING = 'settlement_pending',
  SETTLED = 'settled',
  WRITTEN_OFF = 'written_off',
  BANKRUPTCY = 'bankruptcy',
  DECEASED = 'deceased',
}

@Entity('debt_portfolios')
export class DebtPortfolio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'portfolio_name', length: 255 })
  portfolioName: string;

  @Column({ name: 'seller_name', length: 255 })
  sellerName: string;

  @Column({ name: 'seller_contact_info', length: 255 })
  sellerContactInfo: string;

  @Column({ type: 'date', name: 'purchase_date' })
  purchaseDate: Date;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'purchase_price',
    default: 0,
  })
  purchasePrice: number;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'total_face_value',
    default: 0,
  })
  totalFaceValue: number;

  @Column({ type: 'int', name: 'account_count', default: 0 })
  accountCount: number;

  @Column({
    type: 'enum',
    enum: DebtPortfolioStatus,
    default: DebtPortfolioStatus.PURCHASED,
  })
  @Index()
  status: DebtPortfolioStatus;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    name: 'purchase_price_per_cent',
    default: 0,
  })
  purchasePricePerCent: number;

  @Column({ name: 'contract_document_url', length: 1024, nullable: true })
  contractDocumentUrl?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('debt_portfolio_accounts')
export class DebtPortfolioAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'portfolio_id', type: 'uuid' })
  @Index()
  portfolioId: string;

  @ManyToOne(() => DebtPortfolio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'portfolio_id' })
  portfolio: DebtPortfolio;

  @Column({ name: 'collection_account_id', type: 'uuid', nullable: true })
  @Index()
  collectionAccountId?: string;

  @ManyToOne(() => CollectionAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'collection_account_id' })
  collectionAccount?: CollectionAccount;

  @Column({ name: 'original_creditor', length: 255 })
  originalCreditor: string;

  @Column({ name: 'original_account_number', length: 255 })
  originalAccountNumber: string;

  @Column({ name: 'debtor_name', length: 255 })
  debtorName: string;

  @Column({ name: 'debtor_phone', length: 30, nullable: true })
  debtorPhone?: string;

  @Column({ name: 'debtor_email', length: 255, nullable: true })
  debtorEmail?: string;

  @Column({ name: 'debtor_address', length: 512, nullable: true })
  debtorAddress?: string;

  @Column({ name: 'debtor_state', length: 2 })
  @Index()
  debtorState: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'face_value',
    default: 0,
  })
  faceValue: number;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'purchase_price',
    default: 0,
  })
  purchasePrice: number;

  @Column({
    type: 'enum',
    enum: DebtPortfolioAccountStatus,
    default: DebtPortfolioAccountStatus.PENDING_IMPORT,
  })
  @Index()
  status: DebtPortfolioAccountStatus;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    name: 'total_collected',
    default: 0,
  })
  totalCollected: number;

  @Column({ type: 'date', name: 'last_payment_date', nullable: true })
  lastPaymentDate?: Date;

  @Column({ type: 'date', name: 'charge_off_date', nullable: true })
  chargeOffDate?: Date;

  @Column({ type: 'date', name: 'last_activity_date', nullable: true })
  lastActivityDate?: Date;

  @Column({ type: 'date', name: 'statute_of_limitations_date', nullable: true })
  statuteOfLimitationsDate?: Date;

  @Column('jsonb', { name: 'import_data' })
  importData: Record<string, any>;

  @Column('jsonb', { name: 'custom_fields', nullable: true })
  customFields?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
