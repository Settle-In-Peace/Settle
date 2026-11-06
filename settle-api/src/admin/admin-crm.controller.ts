import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesGuard } from '../auth/guards/sales.guard';
import { AdminService } from './admin.service';

/**
 * AdminCrmController — GET /admin/crm aggregate snapshot.
 *
 * Deliberately a separate controller from AdminController so this read-only
 * overview can run under SalesGuard (admin OR sales staff) instead of the
 * class-level AdminGuard on AdminController — sales staff need the same
 * funnel/revenue picture without full admin powers. Route paths do not
 * overlap with AdminController's, so both can share the /admin prefix.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, SalesGuard)
export class AdminCrmController {
  constructor(private adminService: AdminService) {}

  /**
   * CRM overview — leads, assessments, providers, close_flow revenue and
   * close_flow orders in one response. Backs the /admin/crm-overview page.
   */
  @Get('crm')
  async getCrmOverview() {
    return this.adminService.getCrmOverview();
  }
}
