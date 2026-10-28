'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  API_URL,
  LeadImportBatch,
  LeadVendorStatus,
  getLeadImportBatches,
  getLeadVendorStatuses,
  skipTraceImportBatch,
  startBatchCampaign,
} from '@/lib/api';
import { getToken } from '@/lib/auth';
import { getStoredUser, isAuthenticated } from '@/lib/authUtils';

const inputCls =
  'w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-base';
const labelCls = 'block text-xs text-zinc-500 dark:text-zinc-400 mb-1';

function fmtMoney(n?: number | null) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

/** XHR upload — fetch() can't report upload progress. */
function uploadFile(
  vendor: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ batch: LeadImportBatch }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const qs = `?vendor=${encodeURIComponent(vendor)}&filename=${encodeURIComponent(file.name)}`;
    xhr.open('POST', `${API_URL}/lead-vendors/import/csv${qs}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.message || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — network error'));
    xhr.send(file);
  });
}

export default function BulkImportPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [vendors, setVendors] = useState<LeadVendorStatus[]>([]);
  const [batches, setBatches] = useState<LeadImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Upload state
  const [vendor, setVendor] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<LeadImportBatch | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Per-batch action state
  const [busyBatch, setBusyBatch] = useState<string | null>(null);
  const [campaignFor, setCampaignFor] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [v, b] = await Promise.all([getLeadVendorStatuses(), getLeadImportBatches()]);
      setVendors(v || []);
      setBatches(b || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load import data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    const u = getStoredUser();
    if (u?.role !== 'sales' && u?.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    setUser(u);
    loadAll();
  }, [router, loadAll]);

  const handleUpload = async () => {
    setError('');
    setNotice('');
    setResult(null);
    if (!vendor.trim()) return setError('Pick a vendor / source for this import');
    if (!file) return setError('Choose a .csv or .xlsx file');
    setProgress(0);
    try {
      const { batch } = await uploadFile(vendor.trim(), file, setProgress);
      setResult(batch);
      setNotice(
        `Imported ${batch.imported} leads — ${batch.duplicates} deduped, ` +
          `${batch.dncBlocked} DNC-blocked, ${batch.invalid} invalid.`,
      );
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setProgress(null);
    }
  };

  const handleSkipTrace = async (batchId: string) => {
    setError('');
    setNotice('');
    setBusyBatch(batchId);
    try {
      const res = await skipTraceImportBatch(batchId);
      setNotice(
        `Skip-trace (${res.provider}): ${res.processed} lookups — ` +
          `${res.found} phones found, ${res.manual} queued for manual review` +
          `${res.estimatedCost ? `, est. cost ${fmtMoney(res.estimatedCost)}` : ''}.`,
      );
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Skip-trace failed');
    } finally {
      setBusyBatch(null);
    }
  };

  const handleCampaign = async (batchId: string) => {
    setError('');
    setNotice('');
    setBusyBatch(batchId);
    try {
      const res = await startBatchCampaign(batchId, consentChecked);
      setNotice(
        res.campaignId
          ? `Campaign ${res.campaignId.slice(0, 8)} started — ${res.queued} contacts queued, ${res.skipped.length} skipped.`
          : `No dialable contacts — ${res.skipped.length} leads skipped.`,
      );
      if (res.skipped.length) {
        const reasons = res.skipped.reduce<Record<string, number>>((acc, s) => {
          acc[s.reason] = (acc[s.reason] || 0) + 1;
          return acc;
        }, {});
        setNotice((n) =>
          `${n} Skips: ${Object.entries(reasons).map(([r, c]) => `${r}×${c}`).join(', ')}.`,
        );
      }
      setCampaignFor(null);
      setConsentChecked(false);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Campaign launch failed');
    } finally {
      setBusyBatch(null);
    }
  };

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>;
  }

  const vendorNames = vendors.map((v) => v.name);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Bulk Import</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Upload lead files (CSV or Excel), dedupe them against your book + the DNC list,
            skip-trace the phoneless rows, then chain a batch straight into a dialer campaign.
          </p>
        </header>

        {error && <div className="p-3 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 rounded-lg text-sm">{error}</div>}
        {notice && <div className="p-3 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg text-sm">{notice}</div>}

        {/* ── Upload ─────────────────────────────────────────────── */}
        <section className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3">
          <h2 className="text-lg font-semibold">Upload a file</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Vendor / source *</label>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                list="import-vendor-names"
                placeholder="e.g. boberdoo, in-house-export"
                className={inputCls}
              />
              <datalist id="import-vendor-names">
                {vendorNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Any source name works — it&apos;s stored on the batch for audit.
              </p>
            </div>
            <div>
              <label className={labelCls}>File (.csv or .xlsx) *</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-base"
              />
            </div>
          </div>
          {progress !== null && (
            <div className="w-full h-2 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <button
            onClick={handleUpload}
            disabled={progress !== null}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {progress !== null ? `Uploading… ${progress}%` : 'Import file'}
          </button>
        </section>

        {/* ── Last import result ─────────────────────────────────── */}
        {result && (
          <section className="p-4 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
            <h2 className="text-lg font-semibold mb-2">Batch {result.id.slice(0, 8)} imported</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              {[
                ['Rows', result.totalRows],
                ['Imported', result.imported],
                ['Deduped', result.duplicates],
                ['DNC-blocked', result.dncBlocked],
                ['Invalid', result.invalid],
              ].map(([label, n]) => (
                <div key={label} className="p-2 rounded bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="text-xl font-bold">{n}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
                </div>
              ))}
            </div>
            {!!result.rowErrors?.length && (
              <details className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                <summary className="cursor-pointer">Row details ({result.rowErrors.length})</summary>
                <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                  {result.rowErrors.map((r) => (
                    <li key={r.row}>Row {r.row}: {r.reason}</li>
                  ))}
                </ul>
              </details>
            )}
            <BatchActions
              batch={result}
              busyBatch={busyBatch}
              campaignFor={campaignFor}
              consentChecked={consentChecked}
              onSkipTrace={handleSkipTrace}
              onOpenCampaign={setCampaignFor}
              onConsent={setConsentChecked}
              onCampaign={handleCampaign}
            />
          </section>
        )}

        {/* ── Batch history ──────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Import batches</h2>
            <Link href="/leads" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Browse imported leads →
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No imports yet — upload a file above.</p>
          ) : (
            <div className="space-y-3">
              {batches.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-zinc-500">{b.id.slice(0, 8)}</span>
                      <span className="ml-2 font-medium">{b.vendorName}</span>
                      <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {b.source}
                        {b.filename ? ` · ${b.filename}` : ''} · {fmtDate(b.createdAt)}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        b.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : b.status === 'failed'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {b.totalRows} rows → {b.imported} imported, {b.duplicates} deduped,{' '}
                    {b.dncBlocked} DNC-blocked, {b.invalid} invalid
                    {b.metadata?.skipTrace &&
                      ` · skip-trace: ${b.metadata.skipTrace.found} found / ${b.metadata.skipTrace.manual} manual`}
                    {b.metadata?.campaign &&
                      ` · campaign ${b.metadata.campaign.campaignId?.slice(0, 8) ?? '—'}: ${b.metadata.campaign.queued} queued`}
                  </div>
                  <BatchActions
                    batch={b}
                    busyBatch={busyBatch}
                    campaignFor={campaignFor}
                    consentChecked={consentChecked}
                    onSkipTrace={handleSkipTrace}
                    onOpenCampaign={setCampaignFor}
                    onConsent={setConsentChecked}
                    onCampaign={handleCampaign}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BatchActions({
  batch,
  busyBatch,
  campaignFor,
  consentChecked,
  onSkipTrace,
  onOpenCampaign,
  onConsent,
  onCampaign,
}: {
  batch: LeadImportBatch;
  busyBatch: string | null;
  campaignFor: string | null;
  consentChecked: boolean;
  onSkipTrace: (batchId: string) => void;
  onOpenCampaign: (batchId: string | null) => void;
  onConsent: (checked: boolean) => void;
  onCampaign: (batchId: string) => void;
}) {
  const busy = busyBatch === batch.id;
  return (
    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSkipTrace(batch.id)}
          disabled={busy}
          className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-xs font-medium disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Skip-trace missing phones'}
        </button>
        <button
          onClick={() => onOpenCampaign(campaignFor === batch.id ? null : batch.id)}
          disabled={busy}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-50"
        >
          {campaignFor === batch.id ? 'Cancel campaign' : 'Start campaign'}
        </button>
      </div>
      {campaignFor === batch.id && (
        <div className="p-3 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => onConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm every contact in this batch has provided TCPA consent to be called.
              Per-call DNC and consent gates still apply — non-consented numbers are skipped.
            </span>
          </label>
          <button
            onClick={() => onCampaign(batch.id)}
            disabled={!consentChecked || busy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Launch dialer campaign'}
          </button>
        </div>
      )}
    </div>
  );
}
