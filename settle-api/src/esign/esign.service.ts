import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { EsignSignature } from '../entities/esign-signature.entity';

/** What the signer sees/signs — the signed PDF is generated client-side and
 *  uploaded as base64; the server is authoritative for hashing, storage, and
 *  the audit record. */
export interface SignPayload {
  documentTitle: string;
  documentId?: string;
  /** URI of the source artifact being signed (fileUrl), if any. */
  documentRef?: string;
  /** Inline document text, when the thing signed is text rather than a file. */
  documentText?: string;
  signerName: string;
  signatureMethod: 'drawn' | 'typed';
  signedPdfBase64: string;
  clientId?: string;
  clientSignedAt?: string;
}

export interface SignerContext {
  ip?: string;
  userAgent?: string;
}

const sha256 = (input: Buffer | string) =>
  createHash('sha256').update(input).digest('hex');

/** Hard cap on the signed artifact — signature certs are small; anything
 *  bigger suggests an abuse attempt or a runaway client. */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

const safeSegment = (v: string) =>
  v.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'doc';

/** Columns safe to return in list/detail responses — `signed_pdf` (bytea)
 *  is deliberately excluded everywhere except the download path. */
const PUBLIC_SELECT = {
  id: true,
  userId: true,
  clientId: true,
  documentId: true,
  documentTitle: true,
  documentRef: true,
  signerName: true,
  signatureMethod: true,
  documentSha256: true,
  signedPdfSha256: true,
  auditSha256: true,
  clientSignedAt: true,
  signedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class EsignService {
  private readonly logger = new Logger(EsignService.name);

  constructor(
    @InjectRepository(EsignSignature)
    private readonly signatures: Repository<EsignSignature>,
  ) {}

  /**
   * Persist a signed PDF + immutable audit row.
   *
   * Hashing is server-authoritative: we hash the exact bytes received
   * (the signed PDF) and the received document descriptor — never a
   * client-supplied hash. `auditSha256` binds document + signature +
   * signer + timestamp into one tamper-evident fingerprint.
   *
   * The PDF bytes live on the row (bytea) — settle-api has no external
   * object-storage provider, so the database is the artifact store.
   */
  async sign(userId: string, payload: SignPayload, ctx: SignerContext) {
    const pdfBytes = this.decodePdf(payload.signedPdfBase64);

    const signedAt = new Date();
    const documentSha256 = sha256(
      payload.documentText ??
        `${payload.documentId || ''}|${payload.documentTitle}`,
    );
    const signedPdfSha256 = sha256(pdfBytes);
    const auditSha256 = sha256(
      [
        documentSha256,
        signedPdfSha256,
        payload.signerName,
        signedAt.toISOString(),
      ].join('|'),
    );

    let saved: EsignSignature;
    try {
      saved = await this.signatures.save(
        this.signatures.create({
          userId,
          clientId: payload.clientId ?? null,
          documentId: payload.documentId ?? null,
          documentTitle: payload.documentTitle,
          documentRef: payload.documentRef ?? null,
          signerName: payload.signerName,
          signatureMethod: payload.signatureMethod,
          signedPdf: pdfBytes,
          documentSha256,
          signedPdfSha256,
          auditSha256,
          ipAddress: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          clientSignedAt: payload.clientSignedAt
            ? new Date(payload.clientSignedAt)
            : null,
          signedAt,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      this.logger.error(`esign audit insert failed: ${msg}`);
      throw new ServiceUnavailableException('Could not record signature');
    }

    return {
      success: true,
      signature: this.toResponse(saved),
      // No signed-URL storage — the PDF is served from the download route.
      downloadUrl: `/esign/signatures/${saved.id}/download`,
    };
  }

  /**
   * Signatures visible to the caller: their own; admins may additionally
   * filter by clientId/userId to audit signatures they did not make.
   * Optionally filtered to one document.
   */
  async listSignatures(
    user: { id: string; role?: string },
    opts: { documentId?: string; clientId?: string; userId?: string },
  ) {
    const isAdmin = user.role === 'admin';
    const where: Record<string, any> = {};
    if (opts.documentId) where.documentId = opts.documentId;

    if (isAdmin) {
      if (opts.clientId) where.clientId = opts.clientId;
      if (opts.userId) where.userId = opts.userId;
    } else {
      // Non-admins only ever see their own signatures — clientId/userId
      // filters narrow within that scope, never widen it.
      where.userId = user.id;
      if (opts.clientId) where.clientId = opts.clientId;
    }

    let rows: EsignSignature[];
    try {
      rows = await this.signatures.find({
        select: PUBLIC_SELECT,
        where,
        order: { signedAt: 'DESC' },
        take: 200,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      this.logger.error(`esign list failed: ${msg}`);
      throw new ServiceUnavailableException('Signature lookup unavailable');
    }

    return { signatures: rows.map((r) => this.toResponse(r)) };
  }

  /**
   * Load the stored signed PDF for a caller who can see the signature —
   * the signer themselves, or an admin auditing the trail.
   */
  async downloadPdf(user: { id: string; role?: string }, signatureId: string) {
    const row = await this.signatures.findOne({ where: { id: signatureId } });
    if (!row || (row.userId !== user.id && user.role !== 'admin')) {
      throw new NotFoundException('Signature not found');
    }
    const docSeg = safeSegment(
      row.documentId || row.documentTitle || 'document',
    );
    const fileName = `${docSeg}-signed-${row.signedAt.getTime()}.pdf`;
    return { buffer: row.signedPdf, fileName, signature: this.toResponse(row) };
  }

  private decodePdf(base64: string): Buffer {
    // Tolerate data-URL wrappers (`data:application/pdf;base64,...`).
    const raw = base64.includes(',') ? base64.split(',').pop() : base64;
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('signedPdfBase64 is not valid base64');
    }
    if (!buf.length) throw new BadRequestException('signedPdfBase64 is empty');
    if (buf.length > MAX_PDF_BYTES) {
      throw new BadRequestException('Signed PDF exceeds the 8MB limit');
    }
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException('Signed artifact is not a PDF');
    }
    return buf;
  }

  private toResponse(r: EsignSignature) {
    return {
      id: r.id,
      clientId: r.clientId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      documentRef: r.documentRef,
      signerName: r.signerName,
      signatureMethod: r.signatureMethod,
      documentSha256: r.documentSha256,
      signedPdfSha256: r.signedPdfSha256,
      auditSha256: r.auditSha256,
      signedAt: r.signedAt,
      createdAt: r.createdAt,
    };
  }
}
