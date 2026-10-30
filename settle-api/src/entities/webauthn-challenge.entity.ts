import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Short-lived WebAuthn ceremony challenges — consumed on verify, expire fast. */
@Entity('webauthn_challenges')
export class WebAuthnChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  challenge: string;

  /** 'register' | 'authenticate' */
  @Column({ length: 20 })
  type: string;

  /** Set for register ceremonies (the logged-in user); null for userless auth. */
  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
