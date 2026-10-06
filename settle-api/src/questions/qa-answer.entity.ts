import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { QaQuestion } from './qa-question.entity';

/**
 * qa_answers — community/staff answers on the anonymous Q&A board.
 * `author_label` is the only identity ever exposed publicly
 * ('Community member' | 'Settle team'). Staff answers can be flagged
 * `is_official` to render the verified badge.
 */
@Entity('qa_answers')
export class QaAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_id', type: 'uuid' })
  @Index()
  questionId: string;

  @ManyToOne(() => QaQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question?: QaQuestion;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial: boolean;

  @Column({ name: 'author_label', length: 60, default: 'Community member' })
  authorLabel: string;

  /** Internal only — never serialized to public responses. */
  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId?: string;

  /** Internal only — required for anonymous (unauthenticated) answers. */
  @Column({ name: 'contact_email', length: 255, nullable: true })
  contactEmail?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
