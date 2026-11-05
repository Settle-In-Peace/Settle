import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NurtureSequence } from './nurture-sequence.entity';
import type { NurtureRow, SequenceStatus } from './close-flow.types';

/**
 * Store abstraction — the ONLY per-stack file in the shared module.
 * TypeORM sites use this file as-is; the Supabase-js site (Prime) swaps it
 * for a supabase client implementing the same 6 methods (see
 * docs/SI_CLOSE_FLOW.md § store adapters).
 */
export abstract class CloseFlowStore {
  abstract insert(row: Partial<NurtureRow>): Promise<NurtureRow>;
  abstract update(id: string, patch: Partial<NurtureRow>): Promise<void>;
  abstract due(now: Date, limit: number): Promise<NurtureRow[]>;
  abstract byId(id: string): Promise<NurtureRow | null>;
  /** Latest sequence for a site's lead ref (reissue/dedupe). */
  abstract latestForLead(site: string, leadRef: string): Promise<NurtureRow | null>;
  abstract byStripeSession(sessionId: string): Promise<NurtureRow | null>;
  abstract countsByStatus(site?: string): Promise<Record<string, number>>;
}

@Injectable()
export class TypeOrmCloseFlowStore extends CloseFlowStore {
  constructor(
    @InjectRepository(NurtureSequence)
    private readonly repo: Repository<NurtureSequence>,
  ) {
    super();
  }

  private toRow(e: NurtureSequence): NurtureRow {
    return e as unknown as NurtureRow;
  }

  async insert(row: Partial<NurtureRow>): Promise<NurtureRow> {
    const saved = await this.repo.save(this.repo.create(row as Partial<NurtureSequence>));
    return this.toRow(saved);
  }

  async update(id: string, patch: Partial<NurtureRow>): Promise<void> {
    await this.repo.update(id, patch as Partial<NurtureSequence>);
  }

  async due(now: Date, limit: number): Promise<NurtureRow[]> {
    const rows = await this.repo
      .createQueryBuilder('n')
      .where('n.status = :s', { s: 'active' satisfies SequenceStatus })
      .andWhere('n.next_send_at IS NOT NULL AND n.next_send_at <= :now', { now })
      .orderBy('n.next_send_at', 'ASC')
      .limit(limit)
      .getMany();
    return rows.map((r) => this.toRow(r));
  }

  async byId(id: string): Promise<NurtureRow | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async latestForLead(site: string, leadRef: string): Promise<NurtureRow | null> {
    const row = await this.repo.findOne({
      where: { site, leadRef },
      order: { createdAt: 'DESC' },
    });
    return row ? this.toRow(row) : null;
  }

  async byStripeSession(sessionId: string): Promise<NurtureRow | null> {
    const row = await this.repo.findOne({ where: { stripeSessionId: sessionId } });
    return row ? this.toRow(row) : null;
  }

  async countsByStatus(site?: string): Promise<Record<string, number>> {
    const qb = this.repo
      .createQueryBuilder('n')
      .select('n.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('n.status');
    if (site) qb.where('n.site = :site', { site });
    const rows: { status: string; count: string }[] = await qb.getRawMany();
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }
}
