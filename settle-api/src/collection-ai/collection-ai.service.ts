import { createHash } from 'crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmClientService } from '../ai/llm-client.service';
import {
  CollectionAccount,
  CollectionAccountStatus,
} from '../entities/collection-account.entity';
import { CollectionNote } from '../entities/collection-note.entity';
import { CallLog, CallStatus } from '../entities/call-log.entity';
import {
  DebtorProfile,
  BankruptcyStatus,
} from '../entities/debtor-profile.entity';
import { CrmClient } from '../entities/crm-client.entity';
import {
  ComplianceCheckDto,
  DraftOfferDto,
  SummarizeDto,
} from './dto/collection-ai.dto';

export interface PropensityResult {
  accountId: string;
  score: number;
  reasoning: string;
  keyFactors: string[];
  heuristicScore: number;
  degraded: boolean;
  generatedAt: string;
}

export interface DraftOfferResult {
  accountId: string;
  offerAmount: number;
  targetPercent: number;
  termMonths: number;
  letter: string;
  complianceFlags: string[];
  requiresReview: true;
  generatedAt: string;
}

export type NextAction = 'call' | 'email' | 'sms' | 'letter' | 'settle' | 'escalate';

export interface NextActionResult {
  accountId: string;
  action: NextAction;
  reason: string;
  scriptSnippet?: string;
  requiresReview: true;
  generatedAt: string;
}

export interface SummarizeResult {
  summary: string;
  keyPoints: string[];
  promisedActions: string[];
  sourceItemCount: number;
  generatedAt: string;
}

export interface ComplianceFlag {
  rule: string;
  severity: 'high' | 'medium' | 'low';
  excerpt: string;
  guidance: string;
  source: 'deterministic' | 'llm';
}

export interface ComplianceCheckResult {
  ok: boolean;
  flags: ComplianceFlag[];
  suggestedRewrite?: string;
  requiresReview: true;
  generatedAt: string;
}

interface AccountContext {
  account: CollectionAccount;
  debtorFirstName?: string;
  debtorFlags: {
    doNotCall: boolean;
    litigiousFlag: boolean;
    bankruptcyStatus: string;
    deceased: boolean;
    vulnerabilityPaused: boolean;
  };
  stats: {
    noteCount: number;
    callCount: number;
    answeredCalls: number;
    daysSinceLastContact?: number;
    daysSinceLastPayment?: number;
    solExpired: boolean;
    leadScore?: number;
  };
  recentNotes: string[];
}

const FDCPA_RULES: {
  id: string;
  severity: ComplianceFlag['severity'];
  pattern: RegExp;
  /** If this pattern also matches, the finding is suppressed */
  unless?: RegExp;
  guidance: string;
}[] = [
  {
    id: 'threat_of_arrest',
    severity: 'high',
    pattern: /\b(arrest(ed|ing)?|jail(ed)?|prison|warrant|criminal charges?|prosecut(e|ion))\b/i,
    guidance:
      'FDCPA §807(4)/(5): threatening arrest or criminal prosecution for a civil debt is prohibited. Remove any implication of jail, warrants, or criminal action.',
  },
  {
    id: 'unqualified_legal_threat',
    severity: 'medium',
    pattern: /\b(sue|suing|lawsuit|garnish(ing|ment)?|seize|levy|lien|judgment)\b/i,
    unless:
      /\b(may|might|could|if (and when )?permitted|where permitted|as allowed by law|possible|potential(ly)?)\b/i,
    guidance:
      'FDCPA §807(5): legal action may only be referenced if actually intended and legally permitted. Qualify with "may" and only when true.',
  },
  {
    id: 'violence_or_harm',
    severity: 'high',
    pattern: /\b(physically|beat|hurt you|harm you|violence|come to your (home|house|door))\b/i,
    guidance:
      'FDCPA §806(1): threats of violence or harm are prohibited. Remove immediately.',
  },
  {
    id: 'profanity_or_abuse',
    severity: 'medium',
    pattern: /\b(fuck|shit|bitch|bastard|idiot|stupid|loser|deadbeat|scum)\b/i,
    guidance:
      'FDCPA §806(2): profane or abusive language is prohibited in consumer communications.',
  },
  {
    id: 'contact_hours_violation',
    severity: 'medium',
    pattern: /\b(24\/7|any ?time( of day| of night)?|middle of the night|at work.{0,20}(know|tell)|before 8|after 9)\b/i,
    unless: /\b(between 8 (a\.?m\.?|am) and 9 (p\.?m\.?|pm)|8am.{0,10}9pm|convenient time)\b/i,
    guidance:
      'FDCPA §805(a)(1)/TCPA: calls only 8am–9pm consumer local time; no calls at a workplace known to prohibit them. Do not promise contact outside allowed hours.',
  },
  {
    id: 'third_party_disclosure',
    severity: 'high',
    pattern:
      /\b(tell|telling|inform|notify|contact|call|discuss|reveal|disclose).{0,40}\b(employer|boss|co-?worker|neighbor|family|relative|parent|spouse|friend)\b.{0,40}\b(debt|owe|account|balance|collect)\b|\b(debt|owe|account|balance).{0,40}\b(tell|inform|notify).{0,30}\b(employer|boss|neighbor|family|relative|friend)\b/i,
    guidance:
      'FDCPA §805(b): discussing the debt with third parties is prohibited. Remove references to informing employers, family, or neighbors about the debt.',
  },
  {
    id: 'false_identity',
    severity: 'high',
    pattern:
      /\b(law enforcement|police (officer|department)?|sheriff|fbi|attorney general|government agency|irs|court (officer|order)|process server)\b/i,
    unless: /\b(not|nor are we|isn'?t)\b.{0,30}\b(law enforcement|police|government|attorney)\b/i,
    guidance:
      'FDCPA §807(1)/(6): falsely implying affiliation with law enforcement, courts, or government is prohibited. Remove unless it is a true statement of identity.',
  },
  {
    id: 'credit_deletion_promise',
    severity: 'high',
    pattern:
      /\b(delete|deletion|remov(e|al)|erase|expunge).{0,50}\bcredit (report|bureau|file|history)\b|pay[- ]?for[- ]?delete|guarantee.{0,40}\b(credit score|score increase|credit repair)\b|\b(fix|repair|improve|boost).{0,20}your credit\b/i,
    guidance:
      'Never promise deletion of accurate credit reporting or guaranteed score outcomes — inaccurate and a deceptive-practice risk (FDCPA §807(8), FCRA).',
  },
];

/**
 * Mini-Miranda (FDCPA §807(11)) disclosure check — handled explicitly rather
 * than via the rule table since it detects an *absence*, not a presence.
 */
const MINI_MIRANDA_PATTERN =
  /attempt(ing)? to collect a debt|communication is from a debt collector|this is a debt collector|information obtained will be used for that purpose/i;

@Injectable()
export class CollectionAiService {
  private readonly logger = new Logger(CollectionAiService.name);
  private readonly cache = new Map<string, { expires: number; value: any }>();

  constructor(
    private readonly llm: LlmClientService,
    private readonly config: ConfigService,
    @InjectRepository(CollectionAccount)
    private readonly accountsRepo: Repository<CollectionAccount>,
    @InjectRepository(CollectionNote)
    private readonly notesRepo: Repository<CollectionNote>,
    @InjectRepository(CallLog)
    private readonly callsRepo: Repository<CallLog>,
    @InjectRepository(DebtorProfile)
    private readonly debtorRepo: Repository<DebtorProfile>,
    @InjectRepository(CrmClient)
    private readonly clientsRepo: Repository<CrmClient>,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────

  getStatus(): { configured: boolean; model: string; provider: string } {
    return {
      configured: this.llm.isConfigured(),
      model: this.config.get<string>('AI_MODEL') || 'gpt-4o-mini',
      provider: 'openai-compatible',
    };
  }

  /** Payment-propensity score 0-100 with reasoning. */
  async propensity(accountId: string): Promise<PropensityResult> {
    this.assertConfigured();
    return this.cached(`propensity:${accountId}`, async () => {
      const ctx = await this.loadAccountContext(accountId);
      const heuristic = this.heuristicPropensity(ctx);

      try {
        const parsed = await this.llm.chatJson<{
          score?: number;
          reasoning?: string;
          keyFactors?: string[];
        }>(
          [
            {
              role: 'system',
              content:
                'You are a collections analytics assistant for a licensed debt-collection agency. ' +
                'Estimate the probability that this debtor will make a payment in the next 30 days. ' +
                'Respond ONLY with JSON: {"score": <0-100 integer>, "reasoning": "<2-3 sentences>", "keyFactors": ["<factor>", ...]}. ' +
                'Be realistic and data-driven; do not invent facts not in the input.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                features: this.contextFeatures(ctx),
                heuristicBaseline: heuristic,
              }),
            },
          ],
          { temperature: 0.2, maxTokens: 300 },
        );

        const llmScore = this.clampScore(parsed?.score);
        if (llmScore === null) {
          return {
            accountId,
            score: heuristic,
            reasoning:
              'Heuristic estimate — the AI returned an unparseable score.',
            keyFactors: this.heuristicFactors(ctx),
            heuristicScore: heuristic,
            degraded: true,
            generatedAt: new Date().toISOString(),
          };
        }

        return {
          accountId,
          score: llmScore,
          reasoning:
            parsed?.reasoning?.slice(0, 600) ||
            'AI-estimated payment propensity.',
          keyFactors: Array.isArray(parsed?.keyFactors)
            ? parsed!.keyFactors.slice(0, 6).map(String)
            : this.heuristicFactors(ctx),
          heuristicScore: heuristic,
          degraded: false,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        // Key configured but upstream failed — degrade to heuristic rather than 5xx.
        this.logger.warn(
          `Propensity LLM call failed, using heuristic: ${(error as Error)?.message?.slice(0, 120)}`,
        );
        return {
          accountId,
          score: heuristic,
          reasoning:
            'Heuristic estimate — the AI service is temporarily unreachable.',
          keyFactors: this.heuristicFactors(ctx),
          heuristicScore: heuristic,
          degraded: true,
          generatedAt: new Date().toISOString(),
        };
      }
    });
  }

  /** Draft an FDCPA-safe settlement offer letter — always requiresReview. */
  async draftOffer(dto: DraftOfferDto): Promise<DraftOfferResult> {
    this.assertConfigured();
    const targetPercent = Math.min(100, Math.max(1, dto.targetPercent ?? 60));
    const termMonths = dto.termMonths ?? 0;
    return this.cached(
      `offer:${dto.accountId}:${targetPercent}:${termMonths}:${this.hash(dto.notes || '')}`,
      async () => {
        const ctx = await this.loadAccountContext(dto.accountId);
        const balance = Number(ctx.account.currentBalance) || 0;
        const offerAmount = Math.round(balance * (targetPercent / 100) * 100) / 100;
        const monthly = termMonths > 0
          ? Math.round((offerAmount / termMonths) * 100) / 100
          : undefined;
        const acctDigits = String(ctx.account.accountNumber || '').replace(/\D/g, '');
        const acctRef = acctDigits
          ? `account ending ${acctDigits.slice(-4).padStart(4, '*')}`
          : 'the referenced account';
        const firstName = ctx.debtorFirstName || 'the account holder';

        const parsed = await this.llm.chatJson<{ letter?: string }>(
          [
            {
              role: 'system',
              content:
                'You are a compliance-first drafter for a licensed debt-collection agency. ' +
                'Draft a settlement offer letter for a consumer debt. STRICT requirements:\n' +
                '- Include the mini-Miranda: "This communication is from a debt collector. This is an attempt to collect a debt, and any information obtained will be used for that purpose."\n' +
                '- Offer to settle the account for the stated amount, and say acceptance will resolve the account for less than the full balance.\n' +
                '- NEVER promise deletion, removal, or correction of credit reporting, and never guarantee any credit-score outcome. You may say the creditor will report the account as "settled" or "paid" as required by law.\n' +
                '- Give a 30-day offer validity window and a plain-language "how to accept" section (call or written reply — no phone numbers, use placeholders like [AGENCY PHONE]).\n' +
                '- No threats, no urgency pressure beyond the validity date, no legal jargon that could confuse.\n' +
                '- Use placeholders [DATE], [CREDITOR NAME], [AGENCY NAME] where unknown.\n' +
                'Respond ONLY with JSON: {"letter": "<the full letter text>"}',
            },
            {
              role: 'user',
              content: JSON.stringify({
                debtorFirstName: firstName,
                accountReference: acctRef,
                currentBalance: balance,
                offerAmount,
                offerPercentOfBalance: targetPercent,
                installmentTermMonths: termMonths || undefined,
                monthlyInstallment: monthly,
                extraContext: dto.notes ? this.sanitize(dto.notes).slice(0, 500) : undefined,
              }),
            },
          ],
          { temperature: 0.4, maxTokens: 1200 },
        );

        let letter = parsed?.letter?.trim() || '';
        const complianceFlags: string[] = [];
        if (!letter) {
          letter = this.fallbackOfferLetter(firstName, acctRef, balance, offerAmount, termMonths, monthly);
          complianceFlags.push('AI returned no letter — template fallback used.');
        }

        // Post-check: scan generated letter for banned promises.
        for (const rule of FDCPA_RULES) {
          if (rule.pattern.test(letter) && !(rule.unless && rule.unless.test(letter))) {
            complianceFlags.push(`Draft contains a possible ${rule.id.replace(/_/g, ' ')} — human review required.`);
          }
        }
        if (!MINI_MIRANDA_PATTERN.test(letter)) {
          letter +=
            '\n\nThis communication is from a debt collector. This is an attempt to collect a debt, and any information obtained will be used for that purpose.';
          complianceFlags.push('Mini-Miranda disclosure was missing and has been appended.');
        }

        return {
          accountId: dto.accountId,
          offerAmount,
          targetPercent,
          termMonths,
          letter,
          complianceFlags,
          requiresReview: true as const,
          generatedAt: new Date().toISOString(),
        };
      },
    );
  }

  /** Next-best-action for an account. */
  async nextAction(accountId: string): Promise<NextActionResult> {
    this.assertConfigured();
    return this.cached(`action:${accountId}`, async () => {
      const ctx = await this.loadAccountContext(accountId);

      // Hard compliance overrides — these beat any model suggestion.
      const hardOverride = this.complianceOverride(ctx);
      if (hardOverride) return hardOverride;

      const parsed = await this.llm.chatJson<{
        action?: string;
        reason?: string;
        scriptSnippet?: string;
      }>(
        [
          {
            role: 'system',
            content:
              'You are a collections strategy assistant for a licensed, FDCPA-compliant debt-collection agency. ' +
              'Choose the single best next action for this account. ' +
              'Allowed actions: "call", "email", "sms", "letter", "settle" (extend a settlement offer), "escalate" (supervisor/legal review). ' +
              'Rules: prefer "call" when right-party contact is recent; prefer "letter" when contact attempts are exhausted; ' +
              'choose "settle" when the debtor has shown willingness or partial payments; choose "escalate" for disputes, litigation, or compliance risk. ' +
              'If suggesting call/sms/email, include a short compliant opening script that identifies the caller as a debt collector — no threats, no pressure. ' +
              'Respond ONLY with JSON: {"action": "<action>", "reason": "<1-2 sentences>", "scriptSnippet": "<optional>"}',
          },
          {
            role: 'user',
            content: JSON.stringify({ features: this.contextFeatures(ctx) }),
          },
        ],
        { temperature: 0.3, maxTokens: 400 },
      );

      const allowed: NextAction[] = ['call', 'email', 'sms', 'letter', 'settle', 'escalate'];
      const action = allowed.includes(parsed?.action as NextAction)
        ? (parsed!.action as NextAction)
        : 'letter';

      // Respect DNC even when the model suggests a call.
      const finalAction =
        ctx.debtorFlags.doNotCall && (action === 'call' || action === 'sms')
          ? 'letter'
          : action;

      return {
        accountId,
        action: finalAction,
        reason:
          parsed?.reason?.slice(0, 400) ||
          'Recommended based on account status and contact history.',
        scriptSnippet: parsed?.scriptSnippet
          ? this.sanitize(parsed.scriptSnippet).slice(0, 800)
          : undefined,
        requiresReview: true as const,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /** Summarize call notes / contact log into a CRM activity summary. */
  async summarize(dto: SummarizeDto): Promise<SummarizeResult> {
    this.assertConfigured();
    const cacheKey = dto.accountId
      ? `summary:${dto.accountId}`
      : `summary:text:${this.hash(dto.text || '')}`;
    return this.cached(cacheKey, async () => {
      let sourceText = '';
      let sourceItemCount = 0;

      if (dto.accountId) {
        const [notes, calls] = await Promise.all([
          this.notesRepo.find({
            where: { collectionAccountId: dto.accountId },
            order: { createdAt: 'DESC' },
            take: 25,
          }),
          this.callsRepo.find({
            where: { collectionAccountId: dto.accountId },
            order: { createdAt: 'DESC' },
            take: 15,
          }),
        ]);
        sourceItemCount = notes.length + calls.length;
        if (!sourceItemCount) {
          throw new NotFoundException(
            'No notes or call logs found for this account to summarize.',
          );
        }
        const lines: string[] = [];
        for (const n of notes) {
          lines.push(`[note:${n.noteType}] ${this.sanitize(n.content).slice(0, 500)}`);
        }
        for (const c of calls) {
          const detail = [c.status, c.direction, c.duration ? `${c.duration}s` : null, c.notes]
            .filter(Boolean)
            .join(' ');
          lines.push(`[call] ${this.sanitize(detail).slice(0, 300)}`);
          if (c.transcript) {
            lines.push(`[transcript] ${this.sanitize(c.transcript).slice(0, 1000)}`);
          }
        }
        sourceText = lines.join('\n');
      } else if (dto.text) {
        sourceItemCount = 1;
        sourceText = this.sanitize(dto.text).slice(0, 8000);
      } else {
        throw new NotFoundException(
          'Provide accountId or text to summarize.',
        );
      }

      const parsed = await this.llm.chatJson<{
        summary?: string;
        keyPoints?: string[];
        promisedActions?: string[];
      }>(
        [
          {
            role: 'system',
            content:
              'You are a CRM assistant for a debt-collection agency. Summarize the following collection notes and call log into a concise activity summary for the next agent. ' +
              'Extract concrete facts only — payment promises, disputes, hardship claims, contact outcomes. ' +
              'Respond ONLY with JSON: {"summary": "<3-5 sentences>", "keyPoints": ["..."], "promisedActions": ["<any commitments made by either party>"]}',
          },
          { role: 'user', content: sourceText },
        ],
        { temperature: 0.2, maxTokens: 500 },
      );

      return {
        summary:
          parsed?.summary?.slice(0, 1500) ||
          'Summary unavailable — AI returned no content.',
        keyPoints: Array.isArray(parsed?.keyPoints)
          ? parsed!.keyPoints.slice(0, 8).map((p) => String(p).slice(0, 300))
          : [],
        promisedActions: Array.isArray(parsed?.promisedActions)
          ? parsed!.promisedActions.slice(0, 6).map((p) => String(p).slice(0, 300))
          : [],
        sourceItemCount,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /** Scan a note/script draft for FDCPA/TCPA red flags. */
  async complianceCheck(dto: ComplianceCheckDto): Promise<ComplianceCheckResult> {
    this.assertConfigured();
    return this.cached(
      `compliance:${dto.channel || 'any'}:${this.hash(dto.text)}`,
      async () => {
        const text = dto.text.slice(0, 8000);
        const flags: ComplianceFlag[] = [];

        // Deterministic rule pass — always runs, results are explainable.
        for (const rule of FDCPA_RULES) {
          if (rule.pattern.test(text) && !(rule.unless && rule.unless.test(text))) {
            const m = text.match(rule.pattern);
            flags.push({
              rule: rule.id,
              severity: rule.severity,
              excerpt: (m?.[0] || '').slice(0, 120),
              guidance: rule.guidance,
              source: 'deterministic',
            });
          }
        }

        // Mini-Miranda: required on consumer-facing communications (not internal notes).
        const consumerFacing = !dto.channel || dto.channel !== 'note';
        if (consumerFacing && !MINI_MIRANDA_PATTERN.test(text)) {
          flags.push({
            rule: 'mini_miranda_missing',
            severity: 'medium',
            excerpt: '',
            guidance:
              'Include a disclosure like "This communication is from a debt collector and is an attempt to collect a debt."',
            source: 'deterministic',
          });
        }

        // LLM pass for nuance the regexes can't catch.
        let suggestedRewrite: string | undefined;
        try {
          const parsed = await this.llm.chatJson<{
            flags?: { type?: string; severity?: string; excerpt?: string; explanation?: string }[];
            overallAssessment?: string;
            suggestedRewrite?: string;
          }>(
            [
              {
                role: 'system',
                content:
                  'You are an FDCPA/TCPA compliance reviewer for a debt-collection agency. ' +
                  'Scan the provided draft (note, call script, SMS, email, or letter) for red flags: threats of arrest/violence, ' +
                  'harassment or abuse, unqualified legal threats, contacting at prohibited hours (before 8am/after 9pm local), ' +
                  'third-party disclosure, false identity/misrepresentation, missing debt-collector disclosure, ' +
                  'promises to delete credit reporting or guaranteed credit outcomes, and any deceptive or unfair practice. ' +
                  'If the text is compliant, return an empty flags array. ' +
                  'If flags exist and a safer rewrite is possible, provide suggestedRewrite that keeps the business intent while fixing the issues. ' +
                  'Respond ONLY with JSON: {"flags": [{"type": "...", "severity": "high|medium|low", "excerpt": "...", "explanation": "..."}], "overallAssessment": "...", "suggestedRewrite": "<optional>"}',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  channel: dto.channel || 'unknown',
                  text: this.sanitize(text),
                }),
              },
            ],
            { temperature: 0.1, maxTokens: 900 },
          );

          if (Array.isArray(parsed?.flags)) {
            for (const f of parsed!.flags.slice(0, 10)) {
              const excerpt = String(f.excerpt || '').slice(0, 120);
              // Dedupe against deterministic findings by overlapping excerpt.
              const dupe = flags.some(
                (d) =>
                  d.source === 'deterministic' &&
                  excerpt &&
                  d.excerpt &&
                  (d.excerpt.toLowerCase().includes(excerpt.toLowerCase()) ||
                    excerpt.toLowerCase().includes(d.excerpt.toLowerCase())),
              );
              if (dupe) continue;
              const sev = (['high', 'medium', 'low'] as const).includes(
                f.severity as any,
              )
                ? (f.severity as ComplianceFlag['severity'])
                : 'medium';
              flags.push({
                rule: String(f.type || 'llm_finding').slice(0, 60),
                severity: sev,
                excerpt,
                guidance: String(f.explanation || '').slice(0, 400),
                source: 'llm',
              });
            }
          }
          if (flags.length && parsed?.suggestedRewrite) {
            suggestedRewrite = this.sanitize(parsed.suggestedRewrite).slice(0, 4000);
          }
        } catch (error) {
          this.logger.warn(
            `Compliance LLM pass failed; deterministic results only: ${(error as Error)?.message?.slice(0, 120)}`,
          );
        }

        return {
          ok: !flags.some((f) => f.severity === 'high'),
          flags,
          suggestedRewrite,
          requiresReview: true as const,
          generatedAt: new Date().toISOString(),
        };
      },
    );
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private assertConfigured() {
    if (!this.llm.isConfigured()) {
      throw new ServiceUnavailableException(
        'AI is not configured. Set AI_API_KEY (or OPENAI_API_KEY) on the API.',
      );
    }
  }

  private async loadAccountContext(accountId: string): Promise<AccountContext> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException(`Collection account ${accountId} not found`);
    }

    const [debtor, client, noteCount, calls, recentNotes] = await Promise.all([
      this.debtorRepo.findOne({ where: { crmClientId: account.crmClientId } }),
      this.clientsRepo.findOne({ where: { id: account.crmClientId } }),
      this.notesRepo.count({ where: { collectionAccountId: accountId } }),
      this.callsRepo.find({
        where: { collectionAccountId: accountId },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
      this.notesRepo.find({
        where: { collectionAccountId: accountId },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const answeredCalls = calls.filter(
      (c) =>
        c.status === CallStatus.ANSWERED || c.status === CallStatus.COMPLETED,
    ).length;

    const latestContact = [...calls.map((c) => c.createdAt), ...recentNotes.map((n) => n.createdAt)]
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => b - a)[0];

    const daysSince = (iso?: string | Date) =>
      iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : undefined;

    const leadScore =
      typeof account.customFields?.leadScore === 'number'
        ? account.customFields.leadScore
        : typeof account.customFields?.qualityScore === 'number'
          ? account.customFields.qualityScore
          : undefined;

    return {
      account,
      debtorFirstName: client?.firstName,
      debtorFlags: {
        doNotCall: Boolean(debtor?.doNotCall),
        litigiousFlag: Boolean(debtor?.litigiousFlag),
        bankruptcyStatus: debtor?.bankruptcyStatus || BankruptcyStatus.NONE,
        deceased: Boolean(debtor?.deceasedDate),
        vulnerabilityPaused: Boolean(account.customFields?.vulnerability?.paused),
      },
      stats: {
        noteCount,
        callCount: calls.length,
        answeredCalls,
        daysSinceLastContact: latestContact ? daysSince(new Date(latestContact)) : undefined,
        daysSinceLastPayment: daysSince(account.lastPaymentDate),
        solExpired: Boolean(
          account.statuteOfLimitationsDate &&
            new Date(account.statuteOfLimitationsDate).getTime() < Date.now(),
        ),
        leadScore,
      },
      recentNotes: recentNotes.map((n) => this.sanitize(n.content).slice(0, 300)),
    };
  }

  /** PII-minimized feature set sent to the model — no SSNs, no full account numbers. */
  private contextFeatures(ctx: AccountContext) {
    const a = ctx.account;
    return {
      status: a.status,
      priority: a.priority,
      currentBalance: Number(a.currentBalance) || 0,
      originalBalance: Number(a.originalBalance) || 0,
      balanceChange: Math.round(((Number(a.currentBalance) || 0) - (Number(a.originalBalance) || 0)) * 100) / 100,
      delinquencyDays: a.delinquencyDays || 0,
      daysSinceLastPayment: ctx.stats.daysSinceLastPayment ?? null,
      daysSinceLastContact: ctx.stats.daysSinceLastContact ?? null,
      solExpired: ctx.stats.solExpired,
      chargedOff: Boolean(a.chargedOffDate),
      onPaymentPlan:
        a.status === CollectionAccountStatus.PAYMENT_PLAN ||
        Boolean(a.customFields?.paymentPlan),
      contactAttempts: ctx.stats.callCount,
      answeredCalls: ctx.stats.answeredCalls,
      noteCount: ctx.stats.noteCount,
      leadScore: ctx.stats.leadScore ?? null,
      flags: {
        doNotCall: ctx.debtorFlags.doNotCall,
        litigious: ctx.debtorFlags.litigiousFlag,
        bankruptcy: ctx.debtorFlags.bankruptcyStatus !== BankruptcyStatus.NONE,
        deceased: ctx.debtorFlags.deceased,
        collectionPaused: ctx.debtorFlags.vulnerabilityPaused,
      },
      recentNoteSnippets: ctx.recentNotes.slice(0, 5),
    };
  }

  private heuristicPropensity(ctx: AccountContext): number {
    const { account: a, stats, debtorFlags } = ctx;
    let score = 50;

    if (a.status === CollectionAccountStatus.SETTLED ||
        a.status === CollectionAccountStatus.PAID_IN_FULL ||
        a.status === CollectionAccountStatus.CLOSED) return 5;
    if (debtorFlags.deceased) return 2;
    if (debtorFlags.bankruptcyStatus !== BankruptcyStatus.NONE) score -= 35;
    if (a.status === CollectionAccountStatus.BANKRUPTCY) score -= 35;
    if (a.status === CollectionAccountStatus.LITIGATION) score -= 20;
    if (debtorFlags.vulnerabilityPaused) score -= 15;
    if (stats.solExpired) score -= 20;

    const d = a.delinquencyDays || 0;
    if (d <= 30) score += 15;
    else if (d <= 90) score += 8;
    else if (d <= 180) score += 0;
    else if (d <= 365) score -= 8;
    else score -= 15;

    const lp = stats.daysSinceLastPayment;
    if (lp !== undefined) {
      if (lp <= 90) score += 15;
      else if (lp <= 180) score += 8;
      else score -= 5;
    } else {
      score -= 5;
    }

    if (a.status === CollectionAccountStatus.PAYMENT_PLAN ||
        a.customFields?.paymentPlan) score += 15;
    if (stats.answeredCalls > 0) score += 8;
    else if (stats.callCount >= 5) score -= 8;
    if (a.status === CollectionAccountStatus.CONTACTED) score += 6;
    if (debtorFlags.litigiousFlag) score -= 5;
    if (typeof stats.leadScore === 'number') {
      score += Math.round((stats.leadScore - 50) / 5); // ±10 max
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private heuristicFactors(ctx: AccountContext): string[] {
    const f: string[] = [];
    const { account: a, stats, debtorFlags } = ctx;
    if (stats.daysSinceLastPayment !== undefined && stats.daysSinceLastPayment <= 90)
      f.push('recent payment activity');
    if (a.delinquencyDays > 180) f.push('aged delinquency');
    if (stats.solExpired) f.push('statute of limitations expired');
    if (stats.answeredCalls > 0) f.push('right-party contact established');
    if (a.status === CollectionAccountStatus.PAYMENT_PLAN || a.customFields?.paymentPlan)
      f.push('active payment arrangement');
    if (debtorFlags.bankruptcyStatus !== BankruptcyStatus.NONE)
      f.push('bankruptcy on file');
    if (debtorFlags.doNotCall) f.push('do-not-call flag');
    if (debtorFlags.vulnerabilityPaused) f.push('collection paused (vulnerability)');
    if (!f.length) f.push('limited account history');
    return f.slice(0, 6);
  }

  /** Hard compliance overrides that beat any model suggestion. */
  private complianceOverride(ctx: AccountContext): NextActionResult | null {
    const make = (action: NextAction, reason: string): NextActionResult => ({
      accountId: ctx.account.id,
      action,
      reason,
      requiresReview: true,
      generatedAt: new Date().toISOString(),
    });
    if (ctx.debtorFlags.deceased ||
        ctx.account.status === CollectionAccountStatus.DECEASED) {
      return make('escalate', 'Debtor is deceased — route to supervisor for estate handling. No outbound collection contact.');
    }
    if (ctx.debtorFlags.bankruptcyStatus !== BankruptcyStatus.NONE ||
        ctx.account.status === CollectionAccountStatus.BANKRUPTCY) {
      return make('escalate', 'Bankruptcy on file — collections may violate the automatic stay. Escalate to legal/compliance before any contact.');
    }
    if (ctx.account.status === CollectionAccountStatus.LITIGATION ||
        ctx.debtorFlags.litigiousFlag) {
      return make('escalate', 'Litigation risk flagged — route to supervisor rather than initiating routine outreach.');
    }
    if (ctx.debtorFlags.vulnerabilityPaused) {
      return make('escalate', 'Collection activity is paused for a documented vulnerability/hardship — supervisor review required before resuming contact.');
    }
    return null;
  }

  private fallbackOfferLetter(
    firstName: string,
    acctRef: string,
    balance: number,
    offerAmount: number,
    termMonths: number,
    monthly?: number,
  ): string {
    const money = (n: number) =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const termLine = termMonths > 0 && monthly
      ? `You may pay this settlement in ${termMonths} monthly installments of ${money(monthly)}, or as a single payment of ${money(offerAmount)}.\n\n`
      : '';
    return (
      `[DATE]\n\nDear ${firstName},\n\n` +
      `Re: Settlement offer for ${acctRef}\n\n` +
      `This communication is from a debt collector. This is an attempt to collect a debt, and any information obtained will be used for that purpose.\n\n` +
      `The current balance on the referenced account is ${money(balance)}. ` +
      `We are authorized to offer to settle this account for ${money(offerAmount)}. ` +
      `Upon receipt and clearance of the settlement amount, the account will be considered resolved for less than the full balance, ` +
      `and the creditor will report the account to the credit reporting agencies as required by law.\n\n` +
      termLine +
      `This offer is valid for 30 days from the date of this letter. ` +
      `To accept, contact us at [AGENCY PHONE] or return the enclosed acceptance form to [AGENCY NAME].\n\n` +
      `Sincerely,\n[AGENCY NAME]`
    );
  }

  /**
   * PII minimization before text reaches the LLM: strip SSN-like patterns and
   * long digit runs (account/card numbers), keeping at most the last 4.
   */
  private sanitize(text: string): string {
    if (!text) return text;
    return String(text)
      .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[SSN REDACTED]')
      .replace(/\b\d{9}\b/g, '[ID REDACTED]')
      .replace(/\b\d{8,19}\b/g, (m) => `[NUM ****${m.slice(-4)}]`);
  }

  private clampScore(v: unknown): number | null {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private hash(input: string): string {
    return createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  /** Brief in-memory cache for identical requests — avoids repeat LLM spend. */
  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const ttlMs = this.config.get<number>('AI_CACHE_TTL_MS', 60_000);
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const value = await fn();
    if (this.cache.size > 200) {
      // Simple eviction: drop expired entries first, else oldest key.
      for (const [k, v] of this.cache) {
        if (v.expires <= Date.now()) this.cache.delete(k);
      }
      if (this.cache.size > 200) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { expires: Date.now() + ttlMs, value });
    return value;
  }
}
