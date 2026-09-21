import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('payment_plan_payments')
export class PaymentPlanPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_plan_id', type: 'uuid' })
  @Index()
  paymentPlanId: string;

  @Column({ type: 'int', name: 'installment_number' })
  installmentNumber: number;

  @Column({ type: 'date', name: 'scheduled_date' })
  @Index()
  scheduledDate: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 30, default: 'scheduled' })
  @Index()
  status: string;

  @Column({ type: 'date', name: 'paid_date', nullable: true })
  paidDate?: Date;

  @Column({ type: 'varchar', length: 255, name: 'stripe_charge_id', nullable: true })
  stripeChargeId?: string;

  @Column({ type: 'varchar', length: 255, name: 'stripe_transaction_id', nullable: true })
  stripeTransactionId?: string;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason?: string;

  @Column({ type: 'int', name: 'retry_count', nullable: true })
  retryCount?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
