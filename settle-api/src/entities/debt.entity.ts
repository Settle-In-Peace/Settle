import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 100 })
  creditor!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balance!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'original_balance' })
  originalBalance?: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, name: 'interest_rate' })
  interestRate?: number;

  @Column({ type: 'date', nullable: true, name: 'due_date' })
  dueDate?: Date;

  @Column({ type: 'varchar', length: 50, default: 'credit_card' })
  type!: string; // credit_card, personal_loan, medical, student_loan, other

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string; // active, settled, in_progress, default

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}