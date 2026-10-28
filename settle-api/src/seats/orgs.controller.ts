import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { CurrentOrg } from './current-org.decorator';
import { OrgContext, OrgRoleGuard, OrgRoles } from './org-role.guard';
import { OrgRole } from './org-member.entity';
import { SeatsService } from './seats.service';
import {
  CreateOrgDto,
  InviteMemberDto,
  SeatCheckoutDto,
  UpdateMemberDto,
  UpdateOrgDto,
} from './dto/seats.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

const MANAGERS = [OrgRole.ORG_OWNER, OrgRole.ORG_MANAGER];

/**
 * Orgs — DaaS tenant management.
 *
 * Self-serve routes (JWT + OrgRoleGuard) live under /orgs/me/*.
 * Platform-admin CRUD (JWT + AdminGuard) lives at /orgs, /orgs/:id.
 */
@Controller('orgs')
export class OrgsController {
  constructor(private readonly seatsService: SeatsService) {}

  /** GET /orgs/plans — seat plan catalog (any signed-in user; pricing is public). */
  @Get('plans')
  @UseGuards(JwtAuthGuard)
  listPlans() {
    return this.seatsService.listPlans();
  }

  /**
   * POST /orgs — create an org; the caller becomes org_owner.
   * Platform admins may pass ownerUserId to provision for someone else.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  createOrg(@Req() req: AuthenticatedRequest, @Body() dto: CreateOrgDto & { ownerUserId?: string }) {
    const isAdmin = req.user.role === 'admin';
    const ownerId = isAdmin && dto.ownerUserId ? dto.ownerUserId : req.user.sub;
    return this.seatsService.createOrg(ownerId, dto, isAdmin);
  }

  /** GET /orgs/me — my org + seats used/available + current-period usage. */
  @Get('me')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  getMyOrg(@CurrentOrg() ctx: OrgContext) {
    return this.seatsService.getMyOrg(ctx);
  }

  /** PATCH /orgs/me — rename / billing email (owner only). */
  @Patch('me')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_OWNER)
  updateMyOrg(@CurrentOrg() ctx: OrgContext, @Body() dto: UpdateOrgDto) {
    return this.seatsService.updateMyOrg(ctx, dto);
  }

  /** GET /orgs/me/members — org member roster. */
  @Get('me/members')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  listMembers(@CurrentOrg() ctx: OrgContext) {
    return this.seatsService.listMembers(ctx);
  }

  /** POST /orgs/me/members — add a member by userId or email. */
  @Post('me/members')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @OrgRoles(...MANAGERS)
  addMember(
    @CurrentOrg() ctx: OrgContext,
    @Body() dto: InviteMemberDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.seatsService.addMember(ctx, dto, req.user.sub);
  }

  /** PATCH /orgs/me/members/:id — change role / suspend. */
  @Patch('me/members/:id')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @OrgRoles(...MANAGERS)
  updateMember(
    @CurrentOrg() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.seatsService.updateMember(ctx, id, dto);
  }

  /** POST /orgs/me/seat-checkout — Stripe checkout for N seats on a plan. */
  @Post('me/seat-checkout')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @OrgRoles(...MANAGERS)
  seatCheckout(@CurrentOrg() ctx: OrgContext, @Body() dto: SeatCheckoutDto) {
    return this.seatsService.createSeatCheckout(ctx, dto);
  }

  /** POST /orgs/me/billing-portal — Stripe billing portal for the org. */
  @Post('me/billing-portal')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @OrgRoles(OrgRole.ORG_OWNER, OrgRole.ORG_MANAGER)
  billingPortal(@CurrentOrg() ctx: OrgContext) {
    return this.seatsService.createBillingPortal(ctx);
  }

  // ── Platform admin ─────────────────────────────────────────────────────

  /** GET /orgs — admin: all orgs with active-seat counts. */
  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminListOrgs() {
    return this.seatsService.adminListOrgs();
  }

  /** GET /orgs/:id — admin: org detail + members + seats + usage. */
  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminGetOrg(@Param('id') id: string) {
    return this.seatsService.adminGetOrg(id);
  }

  /** PATCH /orgs/:id — admin: status, plan, seatsPurchased, name. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminUpdateOrg(@Param('id') id: string, @Body() dto: UpdateOrgDto) {
    return this.seatsService.adminUpdateOrg(id, dto);
  }
}
