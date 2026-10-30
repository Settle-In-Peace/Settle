import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** A registered passkey (WebAuthn public-key credential) for a user. */
@Entity('webauthn_credentials')
export class WebAuthnCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  /** base64url credential ID — unique per authenticator key pair. */
  @Column({ name: 'credential_id', length: 255, unique: true })
  credentialId: string;

  /** base64url COSE public key. */
  @Column({ name: 'public_key', type: 'text' })
  publicKey: string;

  /** Signature counter — cloned-authenticator detection. */
  @Column({ type: 'bigint', default: 0 })
  counter: string;

  @Column({ name: 'transports', type: 'simple-array', nullable: true })
  transports?: string[];

  /** User-supplied label — "iPhone 15", "Work MacBook". */
  @Column({ name: 'device_name', length: 120, nullable: true })
  deviceName?: string;

  @Column({ name: 'backed_up', type: 'boolean', default: false })
  backedUp: boolean;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
