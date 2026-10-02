'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LeadImportBatch,
  LeadVendorStatus,
  VendorLead,
  assignVendorLeadToCollections,
  getLeadImportBatches,
  getLeadVendorStatuses,
  getVendorLeads,
  importVendorCsv,
  purchaseVendorLeads,
} from '@/lib/api';
import { getStoredUser, isAuthenticated } from '@/lib/authUtils';

const inputCls =
  'w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm';
const labelCls = 'block text-xs text-zinc-500 dark:text-zinc-400 mb-1';

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  converted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  duplicate: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function fmtMoney(n?: number | null) {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

export default function LeadVendorsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [vendors, setVendors] = useState<LeadVendorStatus[]>([]);
  const [batches, setBatches] = useState<LeadImportBatch[]>([]);
  const [leads, setLeads] = useState<VendorLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters
  const [vendorFilter, setVendorFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [minScore, setMinScore] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [disposition, setDisposition] = useState<'imported' | 'all' | 'duplicates'>('imported');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Purchase / import panels
  const [purchaseVendor, setPurchaseVendor] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadLeads = useCallback(async () => {
    const res = await getVendorLeads({
      vendor: vendorFilter || undefined,
      batchId: batchFilter || undefined,
      minScore: minScore ? Number(minScore) : undefined,
      status: statusFilter || undefined,
      disposition,
      search: search || undefined,
      page,
      limit: 50,
    });
    setLeads(res.leads || []);
    setTotal(res.total || 0);
  }, [vendorFilter, batchFilter, minScore, statusFilter, disposition, search, page]);

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [v, b] = await Promise.all([getLeadVendorStatuses(), getLeadImportBatches()]);
      setVendors(v || []);
      setBatches(b || []);
      await loadLeads();
    } catch (err: any) {
      setError(err?.message || 'Failed to load lead vendor data');
    } finally {
      setLoading(false);
    }
  }, [loadLeads]);

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

  useEffect(() => {
    if (!user) return;
    loadLeads().catch((err: any) => setError(err?.message || 'Failed to load leads'));
  }, [user, loadLeads]);

  const handleCsvImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const fd = new FormData(e.currentTarget);
    const vendor = String(fd.get('vendor') || '').trim();
    const file = fd.get('file') as File | null;
    if (!vendor) return setError('Pick a vendor for this import');
    if (!file || !file.size) return setError('Choose a CSV file');
    setBusy(true);
    try {
      const text = await file.text();
      const { batch } = await importVendorCsv(vendor, text, file.name);
      setNotice(
        `Imported ${batch.imported} leads (${batch.duplicates} duplicates, ${batch.invalid} invalid) — batch ${batch.id.slice(0, 8)}`,
      );
      setImportOpen(false);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'CSV import failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePurchase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const fd = new FormData(e.currentTarget);
    const vendor = String(fd.get('vendor') || '');
    const quantity = Number(fd.get('quantity') || 0);
    const states = String(fd.get('states') || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const minDebt = fd.get('minDebt') ? Number(fd.get('minDebt')) : undefined;
    const maxPricePerLead = fd.get('maxPrice') ? Number(fd.get('maxPrice')) : undefined;
    setBusy(true);
    try {
      const { purchase } = await purchaseVendorLeads({
        vendor,
        quantity,
        states: states.length ? states : undefined,
        minDebt,
        maxPricePerLead,
      });
      setNotice(`Purchase ${purchase.status}: ${purchase.quantityReceived}/${purchase.quantityRequested} leads received${purchase.totalCost != null ? ` for ${fmtMoney(purchase.totalCost)}` : ''}`);
      setPurchaseVendor(null);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Purchase failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async (leadId: string) => {
    setError('');
    setNotice('');
    try {
      const res = await assignVendorLeadToCollections(leadId);
      setNotice(res.alreadyAssigned ? 'Lead already has a collections account' : 'Lead assigned to collections');
      await loadLeads();
    } catch (err: any) {
      setError(err?.message || 'Assignment failed');
    }
  };

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>;
  }

  const vendorNames = vendors.map((v) => v.name);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Lead Vendors</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Buy leads from ping/post vendors, receive vendor webhooks, and import CSV exports.
          </p>
        </header>

        {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}
        {notice && <div className="p-3 bg-emerald-100 text-emerald-800 rounded-lg text-sm">{notice}</div>}

        {/* ── Vendor status cards ─────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Vendors</h2>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading vendors…</p>
          ) : vendors.length === 0 ? (
            <div className="p-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 dark:text-zinc-400">
              No vendors configured. Set <code>LEADVENDOR_NAMES</code> +
              <code> LEADVENDOR_&lt;NAME&gt;_*</code> env vars (or <code>LEADVENDORS_CONFIG</code>) on the API.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map((v) => (
                <div
                  key={v.name}
                  className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{v.displayName || v.name}</div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        v.configured && v.active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : v.configured
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {!v.configured ? 'not configured' : v.active ? 'active' : 'disabled'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {v.name} · {v.supportsPingPost ? 'ping/post' : 'order-only'}
                  </div>
                  {v.products?.length > 0 && (
                    <ul className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
                      {v.products.map((p) => (
                        <li key={p.id}>
                          {p.name}
                          {p.price != null ? ` — ${fmtMoney(p.price)}/lead` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!v.configured && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Set LEADVENDOR_{v.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PING_URL / _POST_URL / _KEY.
                    </p>
                  )}
                  {v.configured && v.active && (
                    <button
                      onClick={() => setPurchaseVendor(purchaseVendor === v.name ? null : v.name)}
                      className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium"
                    >
                      {purchaseVendor === v.name ? 'Cancel' : 'Buy Leads'}
                    </button>
                  )}

                  {purchaseVendor === v.name && (
                    <form onSubmit={handlePurchase} className="mt-3 space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                      <input type="hidden" name="vendor" value={v.name} />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Quantity *</label>
                          <input name="quantity" type="number" min={1} max={500} required className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Max $/lead</label>
                          <input name="maxPrice" type="number" min={0} step="0.01" className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>States (comma-separated)</label>
                        <input name="states" placeholder="TX,FL,CA" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Min debt ($)</label>
                        <input name="minDebt" type="number" min={0} className={inputCls} />
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
                      >
                        {busy ? 'Purchasing…' : 'Purchase'}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Import panel ────────────────────────────────────────── */}
        <section className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Import leads</h2>
            <button
              onClick={() => setImportOpen(!importOpen)}
              className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded text-sm"
            >
              {importOpen ? 'Close' : 'Upload CSV'}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Webhook endpoint for vendors: <code>POST /lead-vendors/import/webhook?vendor=&lt;name&gt;</code> signed
            with <code>X-Lead-Vendor-Signature</code> (HMAC-SHA256, per-vendor secret).
          </p>
          {importOpen && (
            <form onSubmit={handleCsvImport} className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[200px]">
                <label className={labelCls}>Vendor *</label>
                <input name="vendor" list="vendor-names" required placeholder="boberdoo" className={inputCls} />
                <datalist id="vendor-names">
                  {vendorNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>CSV file *</label>
                <input name="file" type="file" accept=".csv,text/csv" required className="text-sm" />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {busy ? 'Importing…' : 'Import'}
              </button>
            </form>
          )}
        </section>

        {/* ── Import batches ──────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Import batches</h2>
          {batches.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-900 text-left text-xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Rows</th>
                    <th className="px-3 py-2 text-right">Imported</th>
                    <th className="px-3 py-2 text-right">Dupes</th>
                    <th className="px-3 py-2 text-right">Invalid</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                  {batches.map((b) => (
                    <tr
                      key={b.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
                      onClick={() => setBatchFilter(batchFilter === b.id ? '' : b.id)}
                      title="Click to filter leads by this batch"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{b.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{b.vendorName}</td>
                      <td className="px-3 py-2">{b.source}</td>
                      <td className="px-3 py-2">
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
                      </td>
                      <td className="px-3 py-2 text-right">{b.totalRows}</td>
                      <td className="px-3 py-2 text-right">{b.imported}</td>
                      <td className="px-3 py-2 text-right">{b.duplicates}</td>
                      <td className="px-3 py-2 text-right">{b.invalid}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(b.totalCost)}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{new Date(b.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Leads table ─────────────────────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold">
              Vendor leads{total ? ` (${total})` : ''}
            </h2>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className={labelCls}>Vendor</label>
                <select value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }} className={inputCls}>
                  <option value="">All</option>
                  {vendorNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Min score</label>
                <input value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1); }} type="number" min={0} max={100} className={`${inputCls} w-24`} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={inputCls}>
                  <option value="">Any</option>
                  {['new', 'converted', 'duplicate', 'rejected', 'expired'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Disposition</label>
                <select value={disposition} onChange={(e) => { setDisposition(e.target.value as any); setPage(1); }} className={inputCls}>
                  <option value="imported">Imported (excl. dupes)</option>
                  <option value="all">All</option>
                  <option value="duplicates">Duplicates only</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Search</label>
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="name / email / phone" className={inputCls} />
              </div>
              {batchFilter && (
                <button
                  onClick={() => setBatchFilter('')}
                  className="px-3 py-2 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                >
                  Batch filter: {batchFilter.slice(0, 8)} ✕
                </button>
              )}
            </div>
          </div>

          {leads.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No vendor leads match the filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-900 text-left text-xs text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">State</th>
                    <th className="px-3 py-2 text-right">Debt</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <td className="px-3 py-2 font-medium">
                        {lead.firstName} {lead.lastName}
                        {lead.tcpaConsent ? null : (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400" title="No TCPA consent on file">no consent</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <div>{lead.phone || '—'}</div>
                        <div>{lead.email || ''}</div>
                      </td>
                      <td className="px-3 py-2">{lead.state || '—'}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(lead.totalDebt)}</td>
                      <td className="px-3 py-2 text-right">
                        <span title={lead.scoreFactors ? JSON.stringify(lead.scoreFactors) : undefined}>
                          {lead.qualityScore}
                          {lead.qualityTier ? <span className="text-xs text-zinc-400"> {lead.qualityTier}</span> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{lead.vendorName || '—'}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(lead.purchaseCost)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[lead.status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {lead.collectionAccountId ? (
                          <a
                            href={`/collections`}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            title={`Collection account ${lead.collectionAccountId}`}
                          >
                            In collections
                          </a>
                        ) : lead.status !== 'duplicate' ? (
                          <button
                            onClick={() => handleAssign(lead.id)}
                            className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700"
                          >
                            → Collections
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400" title={lead.duplicateOf ? `Duplicate of ${lead.duplicateOf}` : undefined}>
                            dupe
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded bg-zinc-200 dark:bg-zinc-800 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-zinc-500 dark:text-zinc-400">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded bg-zinc-200 dark:bg-zinc-800 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
