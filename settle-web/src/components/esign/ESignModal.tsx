'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { esignSign } from '@/lib/api';

export interface ESignResult {
  signatureId: string;
  documentSha256: string;
  signedPdfSha256: string;
  signedAt: string;
  /** API-relative path to the signed PDF (bytes live on the audit row). */
  downloadUrl: string | null;
}

interface ESignModalProps {
  open: boolean;
  onClose: () => void;
  /** Human-readable document name rendered into the signed PDF. */
  documentTitle: string;
  /** Links the audit row back to the record being signed (optional). */
  documentId?: string;
  /** URI of the source artifact (fileUrl), stored for audit. */
  documentRef?: string;
  /** Inline text being signed — rendered into the PDF and hashed server-side. */
  documentText?: string;
  /** Pre-filled legal name; the signer can still edit it. */
  signerName?: string;
  /** CRM client this signature belongs to, when signing in a portal context. */
  clientId?: string;
  onSigned?: (result: ESignResult) => void;
}

type Tab = 'draw' | 'type';

const CONSENT_TEXT =
  'By signing, I agree that this electronic signature is the legal equivalent of ' +
  'my handwritten signature and that I intend to be bound by the document above.';

// ── Inline icons (settle-web doesn't ship lucide-react) ──────────────────
const IconX = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconPen = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
    />
  </svg>
);
const IconType = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M12 7v13m-3 0h6" />
  </svg>
);
const IconEraser = ({ className = 'h-3 w-3' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z"
    />
  </svg>
);
const IconSpinner = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

/**
 * Canvas signature pad — zero-dependency drawing surface. Pointer events
 * cover mouse/touch/stylus; strokes are captured at devicePixelRatio so the
 * exported PNG stays crisp inside the PDF.
 */
function SignaturePad({
  onChange,
  canvasRef,
}: {
  onChange: (hasInk: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const ctx2d = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#18181b';
    }
    return ctx;
  }, [canvasRef]);

  // Size the backing store to the rendered box (DPR-aware) and fill white —
  // a transparent PNG would render black-on-black in some PDF viewers.
  const fit = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(width * dpr));
    c.height = Math.max(1, Math.round(height * dpr));
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    hasInk.current = false;
    onChange(false);
    ctx2d();
  }, [canvasRef, ctx2d, onChange]);

  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const point = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-40 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white touch-none cursor-crosshair"
      onPointerDown={(e) => {
        const ctx = ctx2d();
        if (!ctx) return;
        drawing.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const p = point(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const ctx = ctx2d();
        if (!ctx) return;
        const p = point(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (!hasInk.current) {
          hasInk.current = true;
          onChange(true);
        }
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerLeave={() => {
        drawing.current = false;
      }}
    />
  );
}

/**
 * Build the signed PDF artifact: document identity + optional text, the
 * consent clause, the signature (drawn PNG or typed name), signer, date.
 * The server stores these exact bytes and fingerprints them — the client
 * never sends a hash, only the artifact.
 */
async function buildSignedPdf(opts: {
  documentTitle: string;
  documentId?: string;
  documentText?: string;
  signerName: string;
  method: Tab;
  signatureImage?: string; // PNG data URL
  signedAt: Date;
}): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 56;
  const textW = pageW - margin * 2;
  let y = 72;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text('Settle In Peace — Electronic Signature', margin, y);
  y += 28;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(82, 82, 91);
  doc.text('Signed document', margin, y);
  y += 16;
  doc.setFontSize(12);
  doc.setTextColor(24, 24, 27);
  doc.text(doc.splitTextToSize(opts.documentTitle, textW), margin, y);
  y += 18 * Math.max(1, doc.splitTextToSize(opts.documentTitle, textW).length);
  if (opts.documentId) {
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122);
    doc.text(`Document ID: ${opts.documentId}`, margin, y);
    y += 18;
  }
  y += 6;

  if (opts.documentText) {
    doc.setFontSize(10);
    doc.setTextColor(63, 63, 70);
    const lines = doc.splitTextToSize(opts.documentText, textW);
    // Keep the cert compact — very long texts get their own pages.
    for (const line of lines as string[]) {
      if (y > doc.internal.pageSize.getHeight() - 220) {
        doc.addPage();
        y = 72;
      }
      doc.text(line, margin, y);
      y += 14;
    }
    y += 10;
  }

  if (y > doc.internal.pageSize.getHeight() - 220) {
    doc.addPage();
    y = 72;
  }

  doc.setDrawColor(228, 228, 231);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  doc.text(doc.splitTextToSize(CONSENT_TEXT, textW), margin, y);
  y += 14 * (doc.splitTextToSize(CONSENT_TEXT, textW) as string[]).length + 18;

  // Signature block
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  if (opts.method === 'draw' && opts.signatureImage) {
    doc.addImage(opts.signatureImage, 'PNG', margin, y, 200, 60);
    y += 66;
  } else {
    doc.setFont('times', 'italic');
    doc.setFontSize(26);
    doc.text(opts.signerName, margin, y + 26);
    doc.setFont('helvetica', 'normal');
    y += 56;
  }
  doc.setDrawColor(161, 161, 170);
  doc.line(margin, y, margin + 220, y);
  y += 14;
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  doc.text(`Signed by: ${opts.signerName}`, margin, y);
  y += 13;
  doc.text(
    `Date: ${opts.signedAt.toUTCString()}  ·  Method: ${
      opts.method === 'draw' ? 'Drawn signature' : 'Typed name'
    }`,
    margin,
    y,
  );
  y += 24;

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(
    'Audit trail (SHA-256 fingerprint, IP address, timestamp) is recorded server-side by Settle In Peace.',
    margin,
    y,
  );

  return doc.output('datauristring');
}

/**
 * ESignModal — the reusable signing surface. Renders the document identity,
 * captures a drawn or typed signature plus the signer's legal name, produces
 * the signed PDF client-side (jsPDF, dynamically imported so it stays out of
 * the main bundle), and submits it to /esign/sign for storage + audit.
 */
export default function ESignModal(props: ESignModalProps) {
  // Remount the inner form on every open so signature state starts clean
  // without a reset effect.
  if (!props.open) return null;
  return <ESignModalInner {...props} />;
}

function ESignModalInner({
  onClose,
  documentTitle,
  documentId,
  documentRef,
  documentText,
  signerName,
  clientId,
  onSigned,
}: ESignModalProps) {
  const [tab, setTab] = useState<Tab>('draw');
  const [name, setName] = useState(signerName || '');
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [signedAt] = useState(() => new Date());

  const canSubmit =
    !submitting && name.trim().length > 1 && (tab === 'type' || hasInk);

  const clearPad = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) {
      const { width, height } = c.getBoundingClientRect();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    setHasInk(false);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const signatureImage =
        tab === 'draw' ? canvasRef.current?.toDataURL('image/png') : undefined;
      const pdfDataUrl = await buildSignedPdf({
        documentTitle,
        documentId,
        documentText,
        signerName: name.trim(),
        method: tab,
        signatureImage,
        signedAt,
      });

      const data = await esignSign({
        documentTitle,
        documentId,
        documentRef,
        documentText,
        signerName: name.trim(),
        signatureMethod: tab === 'draw' ? 'drawn' : 'typed',
        signedPdfBase64: pdfDataUrl,
        clientId,
        clientSignedAt: signedAt.toISOString(),
      });
      if (!data?.success || !data.signature) {
        throw new Error('Signing failed');
      }
      const sig = data.signature;
      onSigned?.({
        signatureId: sig.id,
        documentSha256: sig.documentSha256,
        signedPdfSha256: sig.signedPdfSha256,
        signedAt: sig.signedAt,
        downloadUrl: data.downloadUrl || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signing failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg ' +
    'focus:outline-none focus:border-blue-500 text-zinc-900 dark:text-zinc-100 ' +
    'bg-white dark:bg-zinc-800';
  const tabCls = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
      active
        ? 'bg-blue-600 text-white'
        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
    }`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <IconPen className="h-5 w-5 text-blue-600" /> Sign Document
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 truncate" title={documentTitle}>
          {documentTitle}
        </p>

        <div className="flex gap-2 mb-4">
          <button className={tabCls(tab === 'draw')} onClick={() => setTab('draw')}>
            <IconPen /> Draw
          </button>
          <button className={tabCls(tab === 'type')} onClick={() => setTab('type')}>
            <IconType /> Type
          </button>
        </div>

        {tab === 'draw' ? (
          <div className="relative">
            <SignaturePad canvasRef={canvasRef} onChange={setHasInk} />
            <button
              onClick={clearPad}
              className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 bg-white/80 dark:bg-zinc-800/80 px-2 py-1 rounded hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <IconEraser /> Clear
            </button>
          </div>
        ) : (
          <div className="h-40 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white flex items-center justify-center px-6">
            <span
              className="text-3xl text-zinc-900 truncate max-w-full"
              style={{ fontFamily: "'Times New Roman', Times, serif", fontStyle: 'italic' }}
            >
              {name.trim() || 'Your signature'}
            </span>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Legal name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type your full legal name"
            className={inputCls}
            maxLength={200}
          />
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3">
          {CONSENT_TEXT} Signed on{' '}
          {signedAt.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          .
        </p>

        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting && <IconSpinner />}
            {submitting ? 'Signing…' : 'Sign Document'}
          </button>
        </div>
      </div>
    </div>
  );
}
