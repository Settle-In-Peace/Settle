import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skip_trace_lookups')
export class SkipTraceLookup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Internal lead/contact the lookup was run for (loose coupling — no FK). */
  @Column({ name: 'lead_id', nullable: true })
  @Index()
  leadId?: string;

  @Column({ name: 'org_id', nullable: true })
  @Index()
  orgId?: string;

  @Column({ name: 'agent_id', nullable: true })
  agentId?: string;

  @Column({ name: 'vendor', length: 40 })
  vendor: string;

  /** Normalized phones returned — already filtered/sorted by score. */
  @Column({ name: 'phones', type: 'jsonb', default: '[]' })
  phones: { number: string; type?: string; score?: number; dnc?: boolean; tcpa?: boolean; reachable?: boolean }[];

  @Column({ name: 'match_count', type: 'int', default: 0 })
  matchCount: number;

  @Column({ name: 'litigator', type: 'boolean', default: false })
  litigator: boolean;

  @Column({ name: 'bankruptcy', type: 'boolean', default: false })
  bankruptcy: boolean;

  /** Full vendor payload — kept for audit/re-normalization. */
  @Column({ name: 'raw', type: 'jsonb', nullable: true })
  raw?: unknown;

  @Column({ name: 'cost_usd', type: 'numeric', precision: 8, scale: 4, nullable: true })
  costUsd?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
