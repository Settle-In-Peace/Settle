import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('payment_plans')
export class PaymentPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'collection_account_id', type: 'uuid' })
  @Index()
  collectionAccountId: string;

  @Column({ name: 'crm_client_id', type: 'uuid', nullable: true })
  crmClientId?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'total_amount' })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'down_payment', default: 0 })
  downPayment: number;

  @Column({ type: 'int', name: 'number_of_payments' })
  numberOfPayments: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'payment_amount' })
  paymentAmount: number;

  @Column({ type: 'varchar', length: 20, default: 'monthly' })
  frequency: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate: Date;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate?: Date;

  @Column({ type: 'date', name: 'next_payment_date', nullable: true })
  @Index()
  nextPaymentDate?: Date;

  @Column({ type: 'int', name: 'payments_made', default: 0 })
  paymentsMade: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'total_paid', default: 0 })
  totalPaid: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'remaining_balance', default: 0 })
  remainingBalance: number;

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  @Index()
  status: string;

  @Column({ type: 'varchar', length: 100, name: 'payment_method', nullable: true })
  paymentMethod?: string;

  @Column({ type: 'varchar', length: 255, name: 'stripe_payment_method_id', nullable: true })
  stripePaymentMethodId?: string;

  @Column({ type: 'boolean', name: 'auto_pay', default: false })
  autoPay: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'jsonb', name: 'custom_fields', nullable: true })
  customFields?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
