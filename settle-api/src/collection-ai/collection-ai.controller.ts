import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
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
 * Collection SI assistant — propensity scoring, settlement-offer drafting,
 * next-best-action, activity summarization and FDCPA/TCPA compliance checks.
 *
 * Every endpoint degrades to a clear 503 when no AI key is configured
 * (AI_API_KEY or OPENAI_API_KEY). These are premium SI surfaces: calls are
 * metered per user at the shared gateway (`X-SI-Require-Credits`) and answer
 * 402 `insufficient_credits` when the caller's balance is empty — the web
 * panel turns that into a /credits buy prompt. Outputs are advisory only —
 * anything that touches a consumer is marked requiresReview and must be
 * approved by a human.
 */
@Controller('collection-ai')
@UseGuards(JwtAuthGuard, SalesGuard)
export class CollectionAiController {
  constructor(private readonly collectionAi: CollectionAiService) {}

  /** Payment-propensity score (0-100) + reasoning for a collections account. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('propensity/:accountId')
  propensity(
    @Param('accountId') accountId: string,
    @Req() req: Request & { user: any },
  ) {
    return this.collectionAi.propensity(accountId, req.user?.sub);
  }

  /** Draft an FDCPA-safe settlement offer letter. Always requiresReview. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('draft-offer')
  draftOffer(
    @Body() dto: DraftOfferDto,
    @Req() req: Request & { user: any },
  ) {
    return this.collectionAi.draftOffer(dto, req.user?.sub);
  }

  /** Next-best-action for an account (call/email/sms/letter/settle/escalate). */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('next-action')
  nextAction(
    @Body() dto: NextActionDto,
    @Req() req: Request & { user: any },
  ) {
    return this.collectionAi.nextAction(dto.accountId, req.user?.sub);
  }

  /** Summarize call notes / contact log into a CRM activity summary. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('summarize')
  summarize(
    @Body() dto: SummarizeDto,
    @Req() req: Request & { user: any },
  ) {
    return this.collectionAi.summarize(dto, req.user?.sub);
  }

  /** Scan a note/script draft for FDCPA/TCPA red flags. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('compliance-check')
  complianceCheck(
    @Body() dto: ComplianceCheckDto,
    @Req() req: Request & { user: any },
  ) {
    return this.collectionAi.complianceCheck(dto, req.user?.sub);
  }

  /** Config status (no upstream call) — for UI setup hints. */
  @Get('status')
  getStatus() {
    return this.collectionAi.getStatus();
  }
}
