import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CoachingEntitlementGuard } from './coaching-entitlement.guard';
import { CoachingChatService } from './coaching-chat.service';
import { CoachingChatDto } from './dtos/coaching-chat.dto';

/**
 * SI coach — subscription-gated automated coaching chat.
 *
 * Mounted under `coaching/chat` as its own controller so it can gate the
 * POST behind the coaching entitlement while leaving `status` reachable by
 * any signed-in user (the client checks it to degrade gracefully).
 */
@Controller('coaching/chat')
export class CoachingChatController {
  constructor(private readonly chatService: CoachingChatService) {}

  /**
   * Lightweight availability probe — any signed-in user may check whether
   * the SI coach is configured before rendering the chat UI.
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  status() {
    return { configured: this.chatService.isConfigured() };
  }

  /**
   * Send a conversation turn. Subscription-gated via
   * CoachingEntitlementGuard (402 paywall for non-subscribers) and throttled
   * — every call costs upstream model tokens.
   */
  @Post()
  @UseGuards(JwtAuthGuard, CoachingEntitlementGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chat(@Request() req, @Body() dto: CoachingChatDto) {
    return this.chatService.chat(req.user.sub, dto.messages || []);
  }
}
