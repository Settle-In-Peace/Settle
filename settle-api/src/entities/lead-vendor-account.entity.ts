import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LeadVendorType {
  /** Outbound ping/post or order API (boberdoo / LeadsPedia / LeadProsper style) */
  PING_POST = 'ping_post',
  /** Vendor delivers leads only via inbound webhook posts */
  WEBHOOK = 'webhook',
  /** Vendor delivers leads only via file/CSV exports imported by staff */
  FILE_IMPORT = 'file_import',
}

/**
 * A lead vendor account — the non-secret side of a vendor integration.
 *
 * Secrets (API keys, webhook secrets) are NEVER stored here. `apiKeyRef` and
 * `webhookSecretRef` hold the *names* of environment variables that carry the
 * secret values (e.g. `LEADVENDOR_BOBERDOO_KEY`). Non-secret endpoint config
 * may be overridden per-account via `config` (see PingPostVendorConfig).
 *
 * Vendors can also exist purely via env config with no DB row — in that case
 * the registry synthesizes an implicit account (active by default).
 */
@Entity('lead_vendor_accounts')
export class LeadVendorAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Machine name — env var prefix is LEADVENDOR_<NAME>_* (uppercased). */
  @Column({ name: 'vendor_name', length: 100, unique: true })
  @Index()
  vendorName: string;

  @Column({ name: 'display_name', length: 200, nullable: true })
  displayName?: string;

  @Column({
    type: 'enum',
    enum: LeadVendorType,
    name: 'vendor_type',
    default: LeadVendorType.PING_POST,
  })
  vendorType: LeadVendorType;

  /** Whether this vendor account is allowed to purchase / import leads. */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Name of the env var holding the vendor API key (never the key itself). */
  @Column({ name: 'api_key_ref', length: 200, nullable: true })
  apiKeyRef?: string;

  /** Name of the env var holding the inbound-webhook HMAC secret. */
  @Column({ name: 'webhook_secret_ref', length: 200, nullable: true })
  webhookSecretRef?: string;

  /** Published/static price per lead, when the vendor doesn't do ping bidding. */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    name: 'default_price',
    nullable: true,
  })
  defaultPrice?: number;

  /** Non-secret vendor config overrides: endpoints, format, fieldMap, products. */
  @Column('jsonb', { nullable: true })
  config?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
