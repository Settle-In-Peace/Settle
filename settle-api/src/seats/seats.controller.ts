import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from './current-org.decorator';
import { OrgContext, OrgRoleGuard, OrgRoles } from './org-role.guard';
import { OrgRole } from './org-member.entity';
import { SeatsService } from './seats.service';
import { AssignSeatDto, UpdateSeatDto } from './dto/seats.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

const MANAGERS = [OrgRole.ORG_OWNER, OrgRole.ORG_MANAGER];

/**
 * Seat roster for the caller's org — the per-seat DaaS licensing surface.
 * Tenant is resolved from org membership by OrgRoleGuard; seat mutation
 * requires org_owner or org_manager.
 */
@Controller('seats')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  /** GET /seats — org seat roster (with assignee user info). */
  @Get()
  listSeats(@CurrentOrg() ctx: OrgContext) {
    return this.seatsService.listSeats(ctx);
  }

  /** POST /seats — assign a seat to an org member (auto-enrolls agents). */
  @Post()
  @OrgRoles(...MANAGERS)
  assignSeat(
    @CurrentOrg() ctx: OrgContext,
    @Body() dto: AssignSeatDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.seatsService.assignSeat(ctx, dto, req.user.sub);
  }

  /**
   * GET /seats/usage?period=YYYY-MM — per-seat usage rollup synced from
   * dialer_calls. Overage is reported for billing, never hard-blocked.
   */
  @Get('usage')
  getUsage(@CurrentOrg() ctx: OrgContext, @Query('period') period?: string) {
    return this.seatsService.getUsage(ctx, period);
  }

  /** PATCH /seats/:id — change tier or suspend/reactivate. */
  @Patch(':id')
  @OrgRoles(...MANAGERS)
  updateSeat(@CurrentOrg() ctx: OrgContext, @Param('id') id: string, @Body() dto: UpdateSeatDto) {
    return this.seatsService.updateSeat(ctx, id, dto);
  }

  /** POST /seats/:id/release — release the seat (frees a purchased slot). */
  @Post(':id/release')
  @OrgRoles(...MANAGERS)
  releaseSeat(@CurrentOrg() ctx: OrgContext, @Param('id') id: string) {
    return this.seatsService.releaseSeat(ctx, id);
  }
}
