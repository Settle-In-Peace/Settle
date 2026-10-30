import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('org_phone_numbers')
export class OrgPhoneNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id' })
  @Index()
  orgId: string;

  /** E.164 number — e.g. +19515550100 */
  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string;

  /** Telnyx number_order id (ordering reference; not the phone-numbers resource id). */
  @Column({ name: 'telnyx_order_id', length: 64, nullable: true })
  telnyxOrderId?: string;

  /** ordering → active → released */
  @Column({ length: 20, default: 'ordering' })
  status: string;

  @Column({ name: 'friendly_name', length: 120, nullable: true })
  friendlyName?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
