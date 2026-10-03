'use client';

import { useEffect, useState } from 'react';
import {
  CollectionAiComplianceCheck,
  CollectionAiDraftOffer,
  CollectionAiNextAction,
  CollectionAiPropensity,
  CollectionAiStatus,
  CollectionAiSummary,
  checkCollectionAiCompliance,
  draftCollectionAiOffer,
  getCollectionAiNextAction,
  getCollectionAiPropensity,
  getCollectionAiStatus,
  summarizeCollectionAi,
} from '@/lib/api';

/**
 * AI Assist panel for a collection account (settle-api /collection-ai/*).
 *
 * Graceful degradation: when no AI key is configured on the API the panel
 * renders a setup hint instead of the action buttons — it never crashes.
 * Every result is advisory: offer letters and next actions carry a
 * "requires human review" badge and must be approved before consumer use.
 */

const inputCls =
  'w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm';
const labelCls = 'block text-xs text-zinc-500 dark:text-zinc-400 mb-1';
const btnCls =
  'px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50';

function ReviewBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      Requires human review
    </span>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{message}</div>;
}

const ACTION_LABELS: Record<string, string> = {
  call: 'Call',
  email: 'Email',
  sms: 'SMS',
  letter: 'Letter',
  settle: 'Settlement offer',
  escalate: 'Escalate',
};

export default function CollectionAiPanel({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<CollectionAiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [propensity, setPropensity] = useState<CollectionAiPropensity | null>(null);
  const [offer, setOffer] = useState<CollectionAiDraftOffer | null>(null);
  const [nextAction, setNextAction] = useState<CollectionAiNextAction | null>(null);
  const [summary, setSummary] = useState<CollectionAiSummary | null>(null);
  const [compliance, setCompliance] = useState<CollectionAiComplianceCheck | null>(null);

  // Draft offer inputs
  const [offerPct, setOfferPct] = useState(60);
  const [offerMonths, setOfferMonths] = useState(0);
  const [offerNotes, setOfferNotes] = useState('');

  // Compliance check inputs
  const [checkText, setCheckText] = useState('');
  const [checkChannel, setCheckChannel] = useState<'call_script' | 'sms' | 'email' | 'letter' | 'note'>('call_script');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      try {
        const s = await getCollectionAiStatus();
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async <T,>(key: string, fn: () => Promise<T>, onDone: (r: T) => void) => {
    setBusy(key);
    setError('');
    try {
      onDone(await fn());
    } catch (err: any) {
      setError(err?.message || 'AI request failed');
    } finally {
      setBusy(null);
    }
  };

  const severityCls = (sev: string) =>
    sev === 'high'
      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
      : sev === 'medium'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';

  return (
    <div className="space-y-4">
      {statusLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking AI availability…</p>
      ) : status && !status.configured ? (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">AI Assist not configured</p>
          <p className="mt-1 text-xs">
            Set <code>AI_API_KEY</code> (or <code>OPENAI_API_KEY</code>) on the API to enable
            propensity scoring, offer drafting, next-best-action, and compliance checks.
          </p>
        </div>
      ) : null}

      {status?.configured && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Powered by {status.model} — results are advisory. Anything consumer-facing must be
          reviewed by a human before use.
        </p>
      )}

      {status?.configured && (
        <div className="flex flex-wrap gap-2">
          <button
            className={btnCls}
            disabled={busy !== null}
            onClick={() =>
              run('propensity', () => getCollectionAiPropensity(accountId), setPropensity)
            }
          >
            {busy === 'propensity' ? 'Scoring…' : 'Propensity Score'}
          </button>
          <button
            className={btnCls}
            disabled={busy !== null}
            onClick={() =>
              run('next', () => getCollectionAiNextAction(accountId), setNextAction)
            }
          >
            {busy === 'next' ? 'Thinking…' : 'Next Best Action'}
          </button>
          <button
            className={btnCls}
            disabled={busy !== null}
            onClick={() =>
              run('summary', () => summarizeCollectionAi({ accountId }), setSummary)
            }
          >
            {busy === 'summary' ? 'Summarizing…' : 'Summarize Activity'}
          </button>
        </div>
      )}

      <ErrorBox message={error} />

      {/* Propensity result */}
      {propensity && (
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-900 dark:text-white">
              Payment propensity
            </div>
            <span
              className={`px-2 py-0.5 rounded text-sm font-bold ${
                propensity.score >= 60
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : propensity.score >= 35
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              }`}
            >
              {propensity.score}/100
            </span>
          </div>
          {propensity.degraded && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Heuristic estimate — the AI model was unreachable.
            </p>
          )}
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{propensity.reasoning}</p>
          {propensity.keyFactors.length > 0 && (
            <ul className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 list-disc pl-4 space-y-0.5">
              {propensity.keyFactors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Next action result */}
      {nextAction && (
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-900 dark:text-white">
              Next best action: {ACTION_LABELS[nextAction.action] || nextAction.action}
            </div>
            <ReviewBadge />
          </div>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{nextAction.reason}</p>
          {nextAction.scriptSnippet && (
            <pre className="mt-2 p-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300">
              {nextAction.scriptSnippet}
            </pre>
          )}
        </div>
      )}

      {/* Activity summary result */}
      {summary && (
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-900 dark:text-white">
            Activity summary ({summary.sourceItemCount} items)
          </div>
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{summary.summary}</p>
          {summary.keyPoints.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Key points</div>
              <ul className="text-xs text-zinc-500 dark:text-zinc-400 list-disc pl-4 space-y-0.5 mt-1">
                {summary.keyPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.promisedActions.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Promises / commitments</div>
              <ul className="text-xs text-zinc-500 dark:text-zinc-400 list-disc pl-4 space-y-0.5 mt-1">
                {summary.promisedActions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Draft offer */}
      {status?.configured && (
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="text-sm font-medium text-zinc-900 dark:text-white mb-2">
            Draft settlement offer
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Target % of balance</label>
              <input
                type="number"
                min={1}
                max={100}
                value={offerPct}
                onChange={(e) => setOfferPct(Number(e.target.value) || 60)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Installments (months, 0 = lump sum)</label>
              <input
                type="number"
                min={0}
                max={60}
                value={offerMonths}
                onChange={(e) => setOfferMonths(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="mt-2">
            <label className={labelCls}>Context notes (optional)</label>
            <input
              value={offerNotes}
              onChange={(e) => setOfferNotes(e.target.value)}
              placeholder="e.g. debtor verbally offered 40%"
              className={inputCls}
            />
          </div>
          <button
            className={`${btnCls} mt-3`}
            disabled={busy !== null}
            onClick={() =>
              run(
                'offer',
                () =>
                  draftCollectionAiOffer({
                    accountId,
                    targetPercent: offerPct,
                    termMonths: offerMonths || undefined,
                    notes: offerNotes || undefined,
                  }),
                setOffer,
              )
            }
          >
            {busy === 'offer' ? 'Drafting…' : 'Draft Offer Letter'}
          </button>
        </div>
      )}

      {offer && (
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-900 dark:text-white">
              Offer: ${offer.offerAmount.toLocaleString()} ({offer.targetPercent}% of balance)
              {offer.termMonths > 0 ? ` over ${offer.termMonths} months` : ''}
            </div>
            <ReviewBadge />
          </div>
          {offer.complianceFlags.length > 0 && (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {offer.complianceFlags.map((f, i) => (
                <div key={i}>⚠ {f}</div>
              ))}
            </div>
          )}
          <pre className="mt-2 p-3 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300 max-h-96 overflow-y-auto">
            {offer.letter}
          </pre>
        </div>
      )}

      {/* Compliance check */}
      {status?.configured && (
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="text-sm font-medium text-zinc-900 dark:text-white mb-2">
            FDCPA / TCPA compliance check
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className={labelCls}>Channel</label>
              <select
                value={checkChannel}
                onChange={(e) => setCheckChannel(e.target.value as typeof checkChannel)}
                className={inputCls}
              >
                <option value="call_script">Call script</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="letter">Letter</option>
                <option value="note">Internal note</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Text to scan</label>
              <textarea
                value={checkText}
                onChange={(e) => setCheckText(e.target.value)}
                rows={4}
                placeholder="Paste a note, script, SMS, email, or letter draft…"
                className={inputCls}
              />
            </div>
          </div>
          <button
            className={`${btnCls} mt-3`}
            disabled={busy !== null || !checkText.trim()}
            onClick={() =>
              run(
                'compliance',
                () => checkCollectionAiCompliance({ text: checkText, channel: checkChannel }),
                setCompliance,
              )
            }
          >
            {busy === 'compliance' ? 'Scanning…' : 'Run Compliance Check'}
          </button>
        </div>
      )}

      {compliance && (
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-900 dark:text-white">
              {compliance.ok ? 'No high-severity issues found' : `${compliance.flags.length} issue(s) found`}
            </div>
            <ReviewBadge />
          </div>
          {compliance.flags.length > 0 && (
            <ul className="mt-2 space-y-2">
              {compliance.flags.map((f, i) => (
                <li key={i} className="text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${severityCls(f.severity)}`}>
                    {f.severity}
                  </span>{' '}
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {f.rule.replace(/_/g, ' ')}
                  </span>
                  {f.excerpt && (
                    <span className="text-zinc-500 dark:text-zinc-400"> — “{f.excerpt}”</span>
                  )}
                  <div className="mt-0.5 text-zinc-500 dark:text-zinc-400">{f.guidance}</div>
                </li>
              ))}
            </ul>
          )}
          {compliance.suggestedRewrite && (
            <div className="mt-3">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Suggested compliant rewrite
              </div>
              <pre className="p-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300">
                {compliance.suggestedRewrite}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
