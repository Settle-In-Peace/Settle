import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Self-hosted e-signature audit row (ported from Prime's esign_signatures).
 *
 * Each row is an immutable signing event: who signed, what was signed
 * (document id/title/ref), the signed-PDF artifact itself (stored inline as
 * bytea — settle-api has no object-storage provider, so the database is the
 * artifact store for v1), three SHA-256 fingerprints computed server-side
 * (document descriptor, signed PDF bytes, and a binding audit hash), plus
 * the evidence trail (IP, user agent, server timestamp).
 */
@Entity('esign_signatures')
export class EsignSignature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  /** CRM client the signature belongs to, when signing from a client portal
   *  surface. Nullable — staff-side signatures may not have one. */
  @Column({ name: 'client_id', type: 'varchar', length: 64, nullable: true })
  @Index()
  clientId?: string | null;

  /** Links back to the record being signed (e.g. crm_documents.id). */
  @Column({ name: 'document_id', type: 'varchar', length: 200, nullable: true })
  @Index()
  documentId?: string | null;

  @Column({ name: 'document_title', type: 'text' })
  documentTitle: string;

  /** URI of the source artifact being signed (fileUrl), for audit. */
  @Column({ name: 'document_ref', type: 'text', nullable: true })
  documentRef?: string | null;

  @Column({ name: 'signer_name', type: 'varchar', length: 200 })
  signerName: string;

  @Column({
    name: 'signature_method',
    type: 'varchar',
    length: 20,
    default: 'drawn',
  })
  signatureMethod: string;

  /** The fully rendered signed PDF. bytea keeps the artifact next to its
   *  audit row — no external storage dependency. */
  @Column({ name: 'signed_pdf', type: 'bytea' })
  signedPdf: Buffer;

  @Column({ name: 'document_sha256', type: 'varchar', length: 64 })
  documentSha256: string;

  @Column({ name: 'signed_pdf_sha256', type: 'varchar', length: 64 })
  signedPdfSha256: string;

  @Column({ name: 'audit_sha256', type: 'varchar', length: 64 })
  auditSha256: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  /** Signer-claimed timestamp for display; signed_at is server time. */
  @Column({ name: 'client_signed_at', type: 'timestamptz', nullable: true })
  clientSignedAt?: Date | null;

  @Column({ name: 'signed_at', type: 'timestamptz', default: () => 'now()' })
  signedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
