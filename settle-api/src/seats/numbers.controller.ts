import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from './current-org.decorator';
import { NumbersService } from './numbers.service';
import { OrgRole } from './org-member.entity';
import { OrgContext, OrgRoleGuard, OrgRoles } from './org-role.guard';

const MANAGERS = [OrgRole.ORG_OWNER, OrgRole.ORG_MANAGER];

/** Org phone numbers — search/order/release caller IDs under /orgs/me/numbers*. */
@Controller('orgs/me/numbers')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
export class NumbersController {
  constructor(private readonly numbers: NumbersService) {}

  /** GET /orgs/me/numbers/search?prefix=951 — available US numbers. */
  @Get('search')
  search(@Query('prefix') prefix = '', @Query('limit') limit = '10') {
    return this.numbers.search(prefix, Math.min(50, parseInt(limit, 10) || 10));
  }

  /** GET /orgs/me/numbers — this org's numbers. */
  @Get()
  list(@CurrentOrg() ctx: OrgContext) {
    return this.numbers.list(ctx.orgId);
  }

  /** POST /orgs/me/numbers/order — buy a number; it becomes a permitted caller ID. */
  @Post('order')
  @OrgRoles(...MANAGERS)
  order(@CurrentOrg() ctx: OrgContext, @Body() body: { phoneNumber: string; friendlyName?: string }) {
    if (!body.phoneNumber) throw new BadRequestException('phoneNumber is required');
    return this.numbers.order(ctx.orgId, body.phoneNumber, body.friendlyName);
  }

  /** DELETE /orgs/me/numbers/:id — release + revoke caller-ID grant. */
  @Delete(':id')
  @OrgRoles(...MANAGERS)
  release(@CurrentOrg() ctx: OrgContext, @Param('id') id: string) {
    return this.numbers.release(ctx.orgId, id);
  }
}
