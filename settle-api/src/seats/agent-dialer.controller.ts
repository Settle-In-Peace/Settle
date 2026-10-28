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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from './current-org.decorator';
import { OrgContext, OrgRoleGuard, OrgRoles } from './org-role.guard';
import { OrgRole } from './org-member.entity';
import { AgentQueueService } from './agent-queue.service';
import { DispositionDto } from './dto/seats.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

/**
 * Agent dialer surface — complements DialerController (call origination +
 * provider webhooks) with the org-scoped work queue, performance stats and
 * post-call dispositions that power /dashboard/dialer.
 *
 * Tenant boundary = org membership (OrgRoleGuard), so DaaS agents don't
 * need the platform-level 'sales' role to work their queue.
 */
@Controller('dialer')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
export class AgentDialerController {
  constructor(private readonly queueService: AgentQueueService) {}

  /** GET /dialer/queue — assigned accounts/leads with pre-dial compliance status. */
  @Get('queue')
  getQueue(@CurrentOrg() ctx: OrgContext, @Req() req: AuthenticatedRequest) {
    return this.queueService.getQueue(ctx, req.user.sub);
  }

  /** GET /dialer/my-stats — calls today/week, answered, avg duration, dispositions. */
  @Get('my-stats')
  myStats(@Req() req: AuthenticatedRequest) {
    return this.queueService.myStats(req.user.sub);
  }

  /** GET /dialer/team-stats — manager: per-agent rollups + live calls. */
  @Get('team-stats')
  @OrgRoles(OrgRole.ORG_OWNER, OrgRole.ORG_MANAGER)
  teamStats(@CurrentOrg() ctx: OrgContext) {
    return this.queueService.teamStats(ctx);
  }

  /** POST /dialer/calls/:id/disposition — post-call outcome from the dashboard. */
  @Post('calls/:id/disposition')
  setDisposition(
    @CurrentOrg() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: DispositionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.queueService.setDisposition(ctx, id, req.user.sub, dto);
  }
}
