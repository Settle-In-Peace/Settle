'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedApi, getEsignSignatures, fetchSignedPdfObjectUrl, EsignSignatureRecord } from '../../lib/api';
import { getStoredUser, isAuthenticated } from '../../lib/authUtils';
import ComplianceDisclosure from '../../components/ComplianceDisclosure';
import ESignModal from '../../components/esign/ESignModal';

interface PortalDocument {
  id: string;
  documentType: string;
  title: string;
  fileUrl: string;
  fileName?: string;
  status: string;
  createdAt: string;
}

interface Enrollment {
  id: string;
  status: string;
  programType: string;
  enrolledAt: string;
  targetCompletionDate?: string;
  totalDebtEnrolled?: number;
  totalFees?: number;
  monthlyProgramPayment?: number;
}

interface Settlement {
  id: string;
  creditorName: string;
  originalBalance: number;
  settlementAmount: number;
  settlementPercentage: number;
  status: string;
  negotiationStartedAt?: string;
  settledAt?: string;
}

interface Milestone {
  id: string;
  milestoneType: string;
  title: string;
  description?: string;
  isReached: boolean;
  reachedAt?: string;
  targetDate?: string;
  sortOrder: number;
}

interface TrustAccount {
  id: string;
  currentBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
}

export default function SettlementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [trustAccount, setTrustAccount] = useState<TrustAccount | null>(null);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [signatures, setSignatures] = useState<Record<string, EsignSignatureRecord[]>>({});
  const [signDoc, setSignDoc] = useState<PortalDocument | null>(null);
  const [signerName, setSignerName] = useState('');
  const [error, setError] = useState('');

  const loadSignatures = async () => {
    try {
      const data = await getEsignSignatures();
      const map: Record<string, EsignSignatureRecord[]> = {};
      for (const s of data.signatures || []) {
        if (!s.documentId) continue;
        (map[s.documentId] ||= []).push(s);
      }
      setSignatures(map);
    } catch {
      // Signature metadata is decorative — never block the portal.
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && !isAuthenticated()) {
      router.push('/login');
      return;
    }
    fetchPortalData();
    loadSignatures();
  }, [router]);

  const fetchPortalData = async () => {
    const user = getStoredUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setSignerName(
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '',
    );

    try {
      const apiCall = getAuthenticatedApi();

      // Try to fetch enrollment data — if no enrollment, we show the CTA page.
      // /crm/portal/me/overview resolves the caller's CRM client record from
      // the JWT (consumers don't know their crm_clients.id, and the old
      // user.id-based call was both wrong and admin-gated — it always 403'd).
      try {
        const overview = await apiCall<any>(`/crm/portal/me/overview`, { method: 'GET' });
        if (overview?.enrollment) {
          setEnrollment(overview.enrollment);
        }
        if (overview?.settlements) {
          setSettlements(overview.settlements);
        }
        if (overview?.milestones) {
          setMilestones(overview.milestones);
        }
        if (overview?.trustAccount) {
          setTrustAccount(overview.trustAccount);
        }
        if (overview?.documents) {
          setDocuments(overview.documents);
        }
      } catch {
        // No enrollment found — show educational CTA page
      }
    } catch (err) {
      setError('Failed to load settlement data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  // No enrollment — show educational CTA page
  if (!enrollment) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-black dark:text-white mb-4">Debt Settlement Program</h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              You're not enrolled in a debt settlement program yet. Take the free assessment to get matched with a provider who can help you negotiate and settle your debts for less than you owe.
            </p>
          </div>

          {/* How it works */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-8 mb-8">
            <h2 className="text-xl font-bold text-black dark:text-white mb-6">How Debt Settlement Works</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">1</span>
                </div>
                <h3 className="font-semibold text-black dark:text-white mb-2">Take the Assessment</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Answer a few questions about your debt situation. It's free and takes about 2 minutes.
                </p>
              </div>
              <div>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">2</span>
                </div>
                <h3 className="font-semibold text-black dark:text-white mb-2">Get Matched</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  We match you with a debt settlement provider based on your specific situation.
                </p>
              </div>
              <div>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">3</span>
                </div>
                <h3 className="font-semibold text-black dark:text-white mb-2">Track Progress</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Once enrolled, track your settlements, milestones, and payments right here in your portal.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-center text-white mb-8">
            <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-blue-100 mb-6 max-w-xl mx-auto">
              Take the free assessment and get matched with a provider today. No credit check, no obligation.
            </p>
            <Link
              href="/assessment"
              className="inline-block px-8 py-3 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-lg"
            >
              Take the Free Assessment →
            </Link>
          </div>

          {/* Compare providers link */}
          <div className="text-center mb-8">
            <p className="text-zinc-600 dark:text-zinc-400 mb-2">Want to compare providers first?</p>
            <Link
              href="/compare"
              className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              Compare Debt Relief Providers →
            </Link>
          </div>

          <ComplianceDisclosure />
        </div>
      </div>
    );
  }

  // Enrollment exists — show portal
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    enrolled: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    withdrawn: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  };

  const settlementStatusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    negotiating: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    offer_made: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    accepted: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (date?: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-black dark:text-white">Debt Settlement Program</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${statusColors[enrollment.status] || 'bg-zinc-100 text-zinc-700'}`}>
              {enrollment.status}
            </span>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400">
            Track your settlement progress, milestones, and payments
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Program Summary Cards */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Debt Enrolled</p>
            <p className="text-2xl font-bold text-black dark:text-white">
              {formatCurrency(enrollment.totalDebtEnrolled || 0)}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Monthly Payment</p>
            <p className="text-2xl font-bold text-black dark:text-white">
              {formatCurrency(enrollment.monthlyProgramPayment || 0)}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Trust Account Balance</p>
            <p className="text-2xl font-bold text-black dark:text-white">
              {formatCurrency(trustAccount?.currentBalance || 0)}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Target Completion</p>
            <p className="text-2xl font-bold text-black dark:text-white">
              {formatDate(enrollment.targetCompletionDate)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Milestones */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Program Milestones</h2>
            {milestones.length === 0 ? (
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">No milestones yet.</p>
            ) : (
              <div className="space-y-3">
                {milestones.sort((a, b) => a.sortOrder - b.sortOrder).map(m => (
                  <div key={m.id} className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.isReached ? 'bg-green-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                      {m.isReached && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${m.isReached ? 'text-black dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {m.title}
                      </p>
                      {m.description && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{m.description}</p>
                      )}
                      <p className="text-xs text-zinc-400 mt-1">
                        {m.isReached ? `Reached ${formatDate(m.reachedAt)}` : `Target: ${formatDate(m.targetDate)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trust Account */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Trust Account</h2>
            {trustAccount ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Current Balance</span>
                  <span className="font-semibold text-black dark:text-white">{formatCurrency(trustAccount.currentBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Total Deposited</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(trustAccount.totalDeposited)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Total Withdrawn</span>
                  <span className="font-semibold text-zinc-600 dark:text-zinc-400">{formatCurrency(trustAccount.totalWithdrawn)}</span>
                </div>
              </div>
            ) : (
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">No trust account set up yet.</p>
            )}
          </div>
        </div>

        {/* Settlements Table */}
        <div className="mt-8 bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Settlements</h2>
          {settlements.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400 text-sm">No settlements in progress yet. Your provider will negotiate with your creditors and settlements will appear here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Creditor</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Original Balance</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Settlement Amount</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Savings</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map(s => (
                    <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-3 px-4 text-black dark:text-white">{s.creditorName}</td>
                      <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-400">{formatCurrency(s.originalBalance)}</td>
                      <td className="py-3 px-4 text-right text-black dark:text-white font-medium">{formatCurrency(s.settlementAmount)}</td>
                      <td className="py-3 px-4 text-right text-green-600 dark:text-green-400 font-medium">
                        {formatCurrency(s.originalBalance - s.settlementAmount)}
                        <span className="text-xs block text-zinc-400">({(100 - s.settlementPercentage).toFixed(0)}% off)</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${settlementStatusColors[s.status] || 'bg-zinc-100 text-zinc-700'}`}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Documents */}
        {documents.length > 0 && (
          <div className="mt-8 bg-white dark:bg-zinc-900 rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-black dark:text-white">Documents</h2>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {documents.map((d) => {
                const sigs = signatures[d.id] || [];
                const latest = sigs[0];
                return (
                  <div key={d.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-black dark:text-white truncate" title={d.title}>
                        {d.title}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                        {d.documentType?.replace(/_/g, ' ') || 'document'}
                        {latest ? ` · signed ${formatDate(latest.signedAt)}` : ` · ${d.status}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {latest && (
                        <>
                          <span
                            className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            title={`Signed ${new Date(latest.signedAt).toLocaleString()}`}
                          >
                            Signed{sigs.length > 1 ? ` ×${sigs.length}` : ''}
                          </span>
                          <button
                            onClick={async () => {
                              try {
                                const url = await fetchSignedPdfObjectUrl(latest.id);
                                window.open(url, '_blank', 'noopener');
                              } catch {
                                setError('Could not download signed document');
                              }
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                          >
                            Signed PDF
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setSignDoc(d)}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        {latest ? 'Sign again' : 'Sign'}
                      </button>
                      {d.fileUrl && (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8">
          <ComplianceDisclosure />
        </div>
      </div>

      {signDoc && (
        <ESignModal
          open
          onClose={() => setSignDoc(null)}
          documentTitle={signDoc.title}
          documentId={signDoc.id}
          documentRef={signDoc.fileUrl}
          signerName={signerName}
          clientId={getStoredUser()?.id}
          onSigned={() => loadSignatures()}
        />
      )}
    </div>
  );
}
