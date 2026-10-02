import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  DialerCallStatus,
  DialerDirection,
} from './dialer-provider.interface';

/**
 * dialer_calls — one row per call placed through the dialer module.
 *
 * Distinct from `call_logs` (collections scratch-pad entries): this table is
 * the TCPA-aware system of record for provider-originated calls — it keeps
 * the consent/dial-mode flags, the provider call ID used for webhook
 * correlation, and links to the CRM contact / debt / collection account by
 * ID only (no FK joins — matches repo convention).
 */
@Entity('dialer_calls')
export class DialerCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** CRM contact (crm_clients.id) — optional link, ID only. */
  @Column({ name: 'contact_id', nullable: true })
  @Index()
  contactId?: string;

  /** debts.id — optional link, ID only. */
  @Column({ name: 'debt_id', nullable: true })
  @Index()
  debtId?: string;

  /** collection_accounts.id — optional link, ID only. */
  @Column({ name: 'collection_account_id', nullable: true })
  @Index()
  collectionAccountId?: string;

  /** users.id of the agent who placed the call. */
  @Column({ name: 'agent_id', nullable: true })
  @Index()
  agentId?: string;

  /** E.164 normalized destination. */
  @Column({ name: 'phone_number', length: 30 })
  phoneNumber: string;

  @Column({ name: 'from_number', length: 30, nullable: true })
  fromNumber?: string;

  @Column({
    type: 'enum',
    enum: DialerDirection,
    enumName: 'dialer_direction_enum',
    default: DialerDirection.OUTBOUND,
  })
  direction: DialerDirection;

  @Column({
    type: 'enum',
    enum: DialerCallStatus,
    enumName: 'dialer_call_status_enum',
    default: DialerCallStatus.QUEUED,
  })
  @Index()
  status: DialerCallStatus;

  /** 'telnyx' | 'vicidial' | future providers. */
  @Column({ length: 50 })
  provider: string;

  /** Provider-side call identifier (Telnyx call_control_id, …) */
  @Column({ name: 'provider_call_id', length: 255, nullable: true })
  @Index()
  providerCallId?: string;

  /**
   * TCPA flags — always recorded so the dial semantics are explicit in the
   * audit record.
   */
  @Column({ name: 'manual_dial', type: 'boolean', default: true })
  manualDial: boolean;

  @Column({ name: 'consent_confirmed', type: 'boolean', default: false })
  consentConfirmed: boolean;

  /** How consent was established when known (web_form, phone, imported, …). */
  @Column({ name: 'consent_method', length: 32, nullable: true })
  consentMethod?: string;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ name: 'answered_at', type: 'timestamp', nullable: true })
  answeredAt?: Date;

  @Column({ name: 'ended_at', type: 'timestamp', nullable: true })
  endedAt?: Date;

  /** Talk time in seconds. */
  @Column({ type: 'int', nullable: true })
  duration?: number;

  @Column({ name: 'recording_url', type: 'text', nullable: true })
  recordingUrl?: string;

  @Column({ name: 'hangup_cause', length: 100, nullable: true })
  hangupCause?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column('jsonb', { name: 'raw_response', nullable: true })
  rawResponse?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
