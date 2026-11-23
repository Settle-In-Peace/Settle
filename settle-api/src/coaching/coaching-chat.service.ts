import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  InsufficientCreditsError,
  LlmClientService,
  LlmNotConfiguredError,
  LlmUpstreamError,
} from '../ai/llm-client.service';
import { CoachingService } from './coaching.service';
import { CoachingChatMessageDto } from './dtos/coaching-chat.dto';

export interface CoachingChatResult {
  reply: string;
  model: string;
}

/**
 * SI coach — the subscription-gated automated coaching chat. Thin wrapper
 * around the shared OpenAI-compatible LlmClientService (AI_BASE_URL /
 * AI_API_KEY / AI_MODEL; in prod that is the shared si-gateway on :4030).
 *
 * Degrades gracefully per repo rule: `status()` reports configuration and
 * `chat()` answers 503 `si_coach_unavailable` when no AI key is configured —
 * it never crashes and never silently falls back to canned "coach" text.
 */
@Injectable()
export class CoachingChatService {
  private readonly logger = new Logger(CoachingChatService.name);

  constructor(
    private readonly llm: LlmClientService,
    private readonly coachingService: CoachingService,
  ) {}

  isConfigured(): boolean {
    return this.llm.isConfigured();
  }

  /**
   * Reply to the user's coaching conversation. The member's own budget /
   * goal numbers are injected as system context so the coach speaks to
   * THEIR situation instead of generic advice.
   */
  async chat(
    userId: string,
    messages: CoachingChatMessageDto[],
  ): Promise<CoachingChatResult> {
    if (!this.llm.isConfigured()) {
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'si_coach_unavailable',
        message:
          'The SI coach is not configured right now. Please try again later.',
      });
    }

    const systemPrompt = await this.buildSystemPrompt(userId);

    try {
      const { content, model } = await this.llm.chat(
        [
          { role: 'system', content: systemPrompt },
          // Never forward client-supplied system roles — DTO already filters.
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        {
          userId, // gateway metering per member
          temperature: 0.6,
          maxTokens: 500,
        },
      );

      return {
        reply:
          content?.trim() ||
          "I'm here — could you tell me a little more about what you're working on?",
        model,
      };
    } catch (error: any) {
      // 402 credit gate is a billing event, not an outage — propagate as-is.
      if (error instanceof InsufficientCreditsError) throw error;
      if (error instanceof LlmNotConfiguredError) {
        throw new ServiceUnavailableException({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'si_coach_unavailable',
          message:
            'The SI coach is not configured right now. Please try again later.',
        });
      }
      if (error instanceof LlmUpstreamError) {
        this.logger.warn(`SI coach upstream failure: ${error.message}`);
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_GATEWAY,
            error: 'si_coach_upstream',
            message:
              'The SI coach is temporarily unreachable. Please try again in a moment.',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
      this.logger.error(`SI coach error: ${error?.message || error}`);
      throw error;
    }
  }

  /**
   * Compact member context for the system prompt — numbers only, capped so
   * a huge budget can't blow up the prompt. Never includes PII beyond what
   * the member already sees on their own dashboard.
   */
  private async buildSystemPrompt(userId: string): Promise<string> {
    let contextBlock = 'No budgets or goals on file yet.';
    try {
      const dash = await this.coachingService.getDashboard(userId);
      const budgetLines = (dash.budgets || [])
        .slice(0, 3)
        .map((b) => {
          const expenses = (b.expenses || [])
            .slice(0, 12)
            .map((e) => `${e.name}: $${Number(e.amount).toFixed(0)}`)
            .join(', ');
          return `- Budget: income $${Number(b.monthlyIncome).toFixed(0)}/mo` +
            (expenses ? `; expenses ${expenses}` : '');
        });
      const goalLines = (dash.goals || [])
        .slice(0, 6)
        .map(
          (g) =>
            `- Goal "${g.title}": $${Number(g.currentAmount).toFixed(0)} of $${Number(
              g.targetAmount,
            ).toFixed(0)} (${g.completed ? 'complete' : 'in progress'})`,
        );
      const s = dash.summary;
      contextBlock = [
        `Monthly income $${Number(s?.totalMonthlyIncome ?? 0).toFixed(0)}, ` +
          `expenses $${Number(s?.totalMonthlyExpenses ?? 0).toFixed(0)}, ` +
          `net $${Number(s?.netMonthly ?? 0).toFixed(0)}/mo.`,
        ...budgetLines,
        ...goalLines,
      ].join('\n');
    } catch (err: any) {
      this.logger.warn(
        `SI coach context load failed for user ${userId}: ${err?.message || err}`,
      );
    }

    return `You are the SI Coach inside Settle In Peace — an automated, SI-powered financial coaching assistant for people working their way out of debt.

Your job: help the member with budgeting, debt-payoff strategy, savings goals, and staying motivated. Be warm, practical, and non-judgmental. Keep replies concise (under ~150 words) and actionable — suggest concrete next steps when you can.

Member's current financial snapshot:
${contextBlock}

Rules:
- You are an automated coach, not a human. If asked, say so plainly.
- Give general education and coaching — never legal, tax, or investment advice, and never guarantees ("this will fix your credit"). For legal/credit-repair specifics, suggest a qualified professional.
- Never ask for or handle SSNs, bank logins, or card numbers — if the member shares them, tell them not to and continue.
- Stay on topic: budgeting, debt payoff, savings, financial habits. Politely redirect anything else.
- Reference the member's actual numbers above when it makes the guidance specific.`;
  }
}
