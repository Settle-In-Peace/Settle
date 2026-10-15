import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per completed enrollment we've asked for a review — the dedupe
 * ledger for the testimonial flywheel sweep in NurtureService.
 */
@Entity('review_asks')
export class ReviewAsk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'enrollmentId', unique: true })
  @Index()
  enrollmentId!: string;

  @CreateDateColumn({ name: 'sentAt' })
  sentAt!: Date;
}
