import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum OrgStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELED = 'canceled',
}

/**
 * orgs — the DaaS tenant. One row per customer organization (collection
 * agency / law firm) that rents agent seats on the platform.
 *
 * Settle is the software vendor only — the org is the FDCPA-licensed
 * collector of record. `group_id` on the existing crm_* / dnc / consent
 * entities maps to this table's id for tenant scoping.
 */
@Entity('orgs')
export class Org {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'billing_email', length: 255, nullable: true })
  billingEmail?: string;

  /** users.id of the org owner (also mirrored as an org_members org_owner row). */
  @Column({ name: 'owner_user_id', nullable: true })
  @Index()
  ownerUserId?: string;

  /** seat_plans.code the org is subscribed to (starter/pro/enterprise). */
  @Column({ name: 'plan_code', length: 50, nullable: true })
  planCode?: string;

  /** Number of agent seats the org has purchased. */
  @Column({ name: 'seats_purchased', type: 'int', default: 0 })
  seatsPurchased: number;

  @Column({ name: 'stripe_customer_id', length: 255, nullable: true })
  stripeCustomerId?: string;

  @Column({ name: 'stripe_subscription_id', length: 255, nullable: true })
  stripeSubscriptionId?: string;

  /** Stripe subscription status mirror (active, past_due, canceled, trialing). */
  @Column({ name: 'subscription_status', length: 50, nullable: true })
  subscriptionStatus?: string;

  @Column({
    type: 'enum',
    enum: OrgStatus,
    enumName: 'org_status_enum',
    default: OrgStatus.ACTIVE,
  })
  status: OrgStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
