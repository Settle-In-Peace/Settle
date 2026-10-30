import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  /**
   * Conversational debt assessment chatbot.
   * Body: { messages: ChatMessage[], currentData: AssessmentData }
   * Returns: { reply, extractedData, isComplete }
   *
   * Public (assessment visitors are anonymous) but tightly throttled —
   * every call costs OpenAI tokens.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('chat')
  async chat(@Body() body: { messages: any[]; currentData: any }) {
    return this.aiService.conductAssessmentChat(body.messages || [], body.currentData || {});
  }

  /**
   * Generate a personalized recommendation summary.
   * Body: { assessmentData, matchedProviders }
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('recommendation')
  async recommendation(@Body() body: { assessmentData: any; matchedProviders: any[] }) {
    const summary = await this.aiService.generateRecommendationSummary(
      body.assessmentData || {},
      body.matchedProviders || [],
    );
    return { summary };
  }
}
