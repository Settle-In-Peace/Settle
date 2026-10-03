import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesGuard } from '../auth/guards/sales.guard';
import { CollectionAiService } from './collection-ai.service';
import {
  ComplianceCheckDto,
  DraftOfferDto,
  NextActionDto,
  SummarizeDto,
} from './dto/collection-ai.dto';

/**
 * Collection AI assistant — propensity scoring, settlement-offer drafting,
 * next-best-action, activity summarization and FDCPA/TCPA compliance checks.
 *
 * Every endpoint degrades to a clear 503 when no AI key is configured
 * (AI_API_KEY or OPENAI_API_KEY). Outputs are advisory only — anything that
 * touches a consumer is marked requiresReview and must be approved by a human.
 */
@Controller('collection-ai')
@UseGuards(JwtAuthGuard, SalesGuard)
export class CollectionAiController {
  constructor(private readonly collectionAi: CollectionAiService) {}

  /** Payment-propensity score (0-100) + reasoning for a collections account. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('propensity/:accountId')
  propensity(@Param('accountId') accountId: string) {
    return this.collectionAi.propensity(accountId);
  }

  /** Draft an FDCPA-safe settlement offer letter. Always requiresReview. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('draft-offer')
  draftOffer(@Body() dto: DraftOfferDto) {
    return this.collectionAi.draftOffer(dto);
  }

  /** Next-best-action for an account (call/email/sms/letter/settle/escalate). */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('next-action')
  nextAction(@Body() dto: NextActionDto) {
    return this.collectionAi.nextAction(dto.accountId);
  }

  /** Summarize call notes / contact log into a CRM activity summary. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('summarize')
  summarize(@Body() dto: SummarizeDto) {
    return this.collectionAi.summarize(dto);
  }

  /** Scan a note/script draft for FDCPA/TCPA red flags. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('compliance-check')
  complianceCheck(@Body() dto: ComplianceCheckDto) {
    return this.collectionAi.complianceCheck(dto);
  }

  /** Config status (no upstream call) — for UI setup hints. */
  @Get('status')
  getStatus() {
    return this.collectionAi.getStatus();
  }
}
