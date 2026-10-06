import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { FeatureRequest } from './feature-request.entity';

/**
 * feature_request_votes — one row per (request, voter). `voter_id` is the
 * authenticated user's id when logged in, otherwise a client-generated
 * localStorage id (`settle_voter_id`). The unique pair is what makes vote
 * toggles idempotent.
 */
@Entity('feature_request_votes')
@Unique(['requestId', 'voterId'])
export class FeatureRequestVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_id', type: 'uuid' })
  @Index()
  requestId: string;

  @ManyToOne(() => FeatureRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request?: FeatureRequest;

  @Column({ name: 'voter_id', length: 128 })
  voterId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
