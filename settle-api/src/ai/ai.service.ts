import { Injectable, Logger } from '@nestjs/common';
import { LlmClientService } from './llm-client.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AssessmentData {
  totalDebt?: number;
  debtTypes?: string[];
  state?: string;
  employmentStatus?: string;
  monthlyIncome?: number;
  monthsBehind?: number;
  hasFiledBankruptcy?: boolean;
  creditScore?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tcpaConsent?: boolean;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly llm: LlmClientService) {}

  /**
   * Conduct a conversational debt assessment using the configured LLM.
   * The AI asks questions one at a time, extracts debt info from responses,
   * and builds a structured assessment over the conversation.
   */
  async conductAssessmentChat(
    messages: ChatMessage[],
    currentData: AssessmentData,
  ): Promise<{ reply: string; extractedData: AssessmentData; isComplete: boolean }> {
    if (!this.llm.isConfigured()) {
      return {
        reply: "I'm sorry, the AI assistant isn't available right now. Please use our standard assessment form instead.",
        extractedData: currentData,
        isComplete: false,
      };
    }

    const systemPrompt = `You are a compassionate debt relief advisor for Settle, a marketplace that connects people in debt with vetted relief providers.

Your job is to conduct a debt assessment conversation. Ask ONE question at a time. Be empathetic, non-judgmental, and professional. Never give financial advice — just collect information.

You need to collect this information over the conversation:
1. Total unsecured debt amount (credit cards, medical bills, personal loans)
2. Types of debt (credit_card, medical, personal_loan, student_loan)
3. What state they live in (2-letter code)
4. Employment status (employed, self_employed, unemployed, retired)
5. Monthly income
6. How many months behind on payments (0 if current)
7. Whether they've filed bankruptcy
8. Credit score range (poor, fair, good, very_good)
9. Their name, email, and phone number (for provider contact)
10. TCPA consent (permission to be contacted by providers)

Current data collected so far:
${JSON.stringify(currentData, null, 2)}

Rules:
- Ask ONE question at a time
- Extract information from their responses and include it in extractedData
- Be warm and empathetic — people in debt are stressed
- When you have ALL required information, set isComplete to true and give them a summary
- Never ask for sensitive info like SSN or bank account numbers
- Keep responses concise (2-3 sentences max)
- If they ask about specific providers or services, redirect to the assessment

You MUST respond with a JSON object in this exact format:
{
  "reply": "your message to the user",
  "extractedData": { ...any new fields you extracted from the latest user message... },
  "isComplete": false
}`;

    try {
      const parsed = await this.llm.chatJson<{
        reply?: string;
        extractedData?: AssessmentData;
        isComplete?: boolean;
      }>([{ role: 'system', content: systemPrompt }, ...messages], {
        temperature: 0.7,
        maxTokens: 300,
      });

      if (parsed && typeof parsed === 'object') {
        return {
          reply: parsed.reply || "I'm here to help with your debt assessment. Could you tell me more?",
          extractedData: { ...currentData, ...parsed.extractedData },
          isComplete: parsed.isComplete || false,
        };
      }

      return {
        reply: "I'm having trouble understanding. Could you rephrase that?",
        extractedData: currentData,
        isComplete: false,
      };
    } catch (error) {
      this.logger.error(`AI chat error: ${error}`);
      return {
        reply: "I'm having trouble connecting right now. Please try our standard assessment form.",
        extractedData: currentData,
        isComplete: false,
      };
    }
  }

  /**
   * Generate a personalized debt relief recommendation summary.
   */
  async generateRecommendationSummary(
    assessmentData: AssessmentData,
    matchedProviders: any[],
  ): Promise<string> {
    if (!this.llm.isConfigured() || matchedProviders.length === 0) {
      return 'Based on your assessment, we\'ve matched you with several providers. Please review the comparison below.';
    }

    const prompt = `Based on this person's debt assessment, write a brief (3-4 sentence) personalized summary explaining why these providers are a good match.

Assessment: ${JSON.stringify(assessmentData)}
Matched providers: ${JSON.stringify(matchedProviders.map((p) => ({ name: p.companyName, matchScore: p.matchScore, matchReasons: p.matchReasons })))}

Be encouraging and specific. Mention their debt amount and how the providers can help.`;

    try {
      const { content } = await this.llm.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 200 },
      );
      return content || '';
    } catch (error) {
      this.logger.error(`AI summary error: ${error}`);
      return 'We\'ve matched you with providers that fit your specific debt situation. Review the options below to find your best match.';
    }
  }
}
