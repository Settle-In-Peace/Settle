import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum FeatureRequestStatus {
  UNDER_REVIEW = 'under_review',
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  SHIPPED = 'shipped',
  DECLINED = 'declined',
}

/**
 * feature_requests — public feature-request board backing /roadmap and the
 * floating Feedback widget. Anonymous submissions are allowed (author_* are
 * optional); votes are recounted authoritatively from feature_request_votes.
 */
@Entity('feature_requests')
export class FeatureRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ length: 50, default: 'general' })
  category: string;

  @Column({ length: 20, default: FeatureRequestStatus.UNDER_REVIEW })
  @Index()
  status: FeatureRequestStatus;

  /** Denormalized vote count — always recounted from feature_request_votes. */
  @Column({ type: 'int', default: 0 })
  votes: number;

  @Column({ name: 'author_name', length: 120, nullable: true })
  authorName?: string;

  @Column({ name: 'author_email', length: 255, nullable: true })
  authorEmail?: string;

  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  @Index()
  authorUserId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
