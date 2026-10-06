import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum QaCategory {
  PROBATE = 'probate',
  DEBTS = 'debts',
  TAXES = 'taxes',
  PROPERTY = 'property',
  FAMILY = 'family',
  OTHER = 'other',
}

export enum QaQuestionStatus {
  PUBLISHED = 'published',
  HIDDEN = 'hidden',
  ANSWERED = 'answered',
}

/**
 * qa_questions — anonymous Q&A board for executors/families settling an
 * estate. Anonymity is the feature: `author_user_id` and `contact_email` are
 * stored internally for moderation/follow-up but are NEVER returned by
 * public endpoints — every public response marks the author as anonymous.
 */
@Entity('qa_questions')
export class QaQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ length: 30, default: QaCategory.OTHER })
  @Index()
  category: QaCategory;

  @Column({ length: 20, default: QaQuestionStatus.PUBLISHED })
  @Index()
  status: QaQuestionStatus;

  /** Denormalized — recounted from qa_answers on each new answer. */
  @Column({ name: 'answers_count', type: 'int', default: 0 })
  answersCount: number;

  /** Internal only — never serialized to public responses. */
  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId?: string;

  /** Internal only — optional contact for follow-up; never displayed. */
  @Column({ name: 'contact_email', length: 255, nullable: true })
  contactEmail?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
