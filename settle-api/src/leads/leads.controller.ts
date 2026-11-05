import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { CloseFlowService } from '../close-flow/close-flow.service';
import { SETTLE_SITE } from '../close-flow/site.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderGuard } from '../auth/guards/provider.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { BatchPurchaseLeadsDto } from './dto/batch-purchase-leads.dto';

@Controller('leads')
export class LeadsController {
  constructor(
    private leadsService: LeadsService,
    private closeFlow: CloseFlowService,
  ) {}

  // Public: consumer submits the assessment quiz
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('assessment')
  async submitAssessment(@Body() body: CreateLeadDto, @Request() req: any) {
    // Capture TCPA consent audit metadata from the request. The X-Forwarded-For
    // header carries the real client IP when behind Render/Railway proxies.
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
    const consentIp = ip || req.socket?.remoteAddress || req.ip || '';
    const consentUserAgent = req.headers?.['user-agent'] || '';

    return this.leadsService.submitAssessment({
      ...body,
      consentIp,
      consentUserAgent,
    });
  }

  // Provider-only: see available leads in marketplace
  @SkipThrottle()
  @Get('available')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async getAvailableLeads() {
    return this.leadsService.getAvailableLeads();
  }

  // Provider-only: purchase a lead
  @SkipThrottle()
  @Post(':id/purchase')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async purchaseLead(@Param('id') id: string, @Request() req) {
    // In production, req.user.sub would be the provider ID from their JWT
    return this.leadsService.purchaseLead(id, req.user.sub);
  }

  // Provider-only: view leads they purchased
  @SkipThrottle()
  @Get('my-leads')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async getMyLeads(@Request() req) {
    return this.leadsService.getLeadsByProvider(req.user.sub);
  }

  // Admin/internal: stats
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('stats')
  async getStats() {
    return this.leadsService.getLeadStats();
  }

  // Provider-only: full lead details before purchase (sensitive info masked)
  @SkipThrottle()
  @Get(':id/details')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async getLeadDetails(@Param('id') id: string, @Request() req) {
    return this.leadsService.getLeadDetails(id, req.user.sub);
  }

  // Provider-only: purchase multiple leads (body: { leadIds: string[] })
  @SkipThrottle()
  @Post('batch-purchase')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async batchPurchaseLeads(@Body() body: BatchPurchaseLeadsDto, @Request() req) {
    return this.leadsService.batchPurchaseLeads(body.leadIds, req.user.sub);
  }

  // Consumer: check if their lead has been purchased
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get(':id/status')
  async getLeadStatus(@Param('id') id: string) {
    return this.leadsService.getLeadStatus(id);
  }

  // Public: (re)issue the priority-match checkout for an assessment lead —
  // the compare-page "unlock direct contact" button and the nurture
  // messages point here. Reuses the active sequence's link when present.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':id/match-checkout')
  async matchCheckout(@Param('id') id: string) {
    const lead = await this.leadsService.findRawById(id);
    if (!lead) return { action: 'not_found' };
    const res = await this.closeFlow.reissue(id, SETTLE_SITE, {
      leadRef: id,
      vertical: 'match_fee',
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      zip: lead.zipCode,
    });
    return res;
  }
}