import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AffiliateConversionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAID = 'paid',
}

/**
 * affiliate_conversions — one row per inbound affiliate-network postback
 * (CuraDebt, Awin, FlexOffers, SmartCredit, …). These are the events that
 * reconcile our referral payouts — see docs/16K_MONTHLY_GROWTH_PLAN.md §1.4.
 *
 * `raw_payload` always stores the complete postback params so nothing is
 * lost when a network sends fields we don't normalize yet.
 *
 * Dedupe: (network, transaction_id) is unique — networks that re-fire the
 * same postback (retry on timeout, test pings) collapse onto one row.
 */
@Entity('affiliate_conversions')
export class AffiliateConversion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Normalized network slug, e.g. 'curadebt', 'awin', 'smartcredit'. */
  @Column({ length: 60 })
  @Index()
  network: string;

  /** Network's unique conversion/transaction id — the dedupe key. */
  @Column({ name: 'transaction_id', length: 160, nullable: true })
  transactionId?: string;

  /** Our click/sub id echoed back by the network (subid, aff_sub, s1…). */
  @Column({ name: 'click_id', length: 160, nullable: true })
  clickId?: string;

  /** Optional link to the consumer lead that produced this conversion. */
  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  @Index()
  leadId?: string;

  /** Payout in minor currency units (cents for USD). */
  @Column({ name: 'payout_cents', type: 'int', nullable: true })
  payoutCents?: number;

  @Column({ length: 8, default: 'USD' })
  currency: string;

  @Column({ length: 20, default: AffiliateConversionStatus.PENDING })
  @Index()
  status: AffiliateConversionStatus;

  /** e.g. 'conversion', 'lead', 'sale', 'test'. */
  @Column({ name: 'event_type', length: 40, default: 'conversion' })
  eventType: string;

  /** Complete postback params (query + body) exactly as received. */
  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  @Column({ name: 'received_at', type: 'timestamp', default: () => 'now()' })
  receivedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
