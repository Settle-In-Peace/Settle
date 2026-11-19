import { Controller, Get, Post, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderGuard } from '../auth/guards/provider.guard';
import { AdminGuard } from '../admin/admin.guard';

@Controller('matching')
export class MatchingController {
  constructor(private matchingService: MatchingService) {}

  // --- Consumer endpoints ---

  /** Public, consumer-facing: get recommended providers for a lead. */
  @Get('recommended/:leadId')
  async getRecommendedProviders(@Param('leadId') leadId: string) {
    return this.matchingService.getRecommendedProviders(leadId);
  }

  /**
   * Consumer requests contact from a provider (body: { leadId, providerId }).
   * Auth model: the leadId itself is the bearer capability (unguessable UUID)
   * and the service additionally requires the lead's priority-match fee to be
   * paid when the fee gate is enabled. No per-user session exists for
   * anonymous assessment leads, so throttling is the abuse backstop.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('request-contact')
  async requestContact(@Body() body: { leadId: string; providerId: string }) {
    return this.matchingService.requestContact(body.leadId, body.providerId);
  }

  // --- Provider endpoints ---

  /** Provider: get leads matched to the authenticated provider. */
  @Get('matched-leads')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async getMatchedLeads(@Request() req) {
    return this.matchingService.getMatchedLeadsForProvider(req.user.sub);
  }

  /** Provider or consumer: decline a match (ownership verified in service). */
  @Post(':id/decline')
  @UseGuards(JwtAuthGuard)
  async declineMatch(
    @Param('id') id: string,
    @Body('userType') userType: 'provider' | 'consumer' = 'provider',
    @Request() req,
  ) {
    return this.matchingService.declineMatch(id, userType, req.user.sub);
  }

  /** Provider: match history. */
  @Get('history')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async getMatchHistory(@Request() req) {
    return this.matchingService.getMatchHistory(req.user.sub);
  }

  // --- Admin endpoints ---

  /** Admin: match statistics. */
  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getMatchStats() {
    return this.matchingService.getMatchStats();
  }

  /** Admin: all matches with pagination. */
  @Get('all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllMatches(@Query('page') page?: string, @Query('limit') limit?: string) {
    const parsedPage = Number.parseInt(page ?? '', 10);
    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const p = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const l = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    return this.matchingService.getAllMatches(p, l);
  }
}
