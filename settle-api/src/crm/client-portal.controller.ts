import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowPortalService } from './workflow-portal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Consumer-facing client portal. These routes used to live inside
 * WorkflowPortalController behind a class-level AdminGuard — which meant the
 * consumers they were built for always got 403 and the /settlement page could
 * never render a real enrollment, document, or signature.
 *
 * Access rule: the caller must own the client record
 * (crm_clients.user_id === req.user.sub) or be an admin.
 */
@Controller('crm/portal')
@UseGuards(JwtAuthGuard)
export class ClientPortalController {
  constructor(private readonly wpService: WorkflowPortalService) {}

  /** Throws 403 unless the JWT subject owns the client or is an admin. */
  private async assertClientAccess(clientId: string, user: any): Promise<void> {
    if (user?.role === 'admin') return;
    const client = await this.wpService.getClient(clientId);
    if (!client || client.userId !== user?.sub) {
      throw new ForbiddenException('You do not have access to this client portal');
    }
  }

  /** Resolve the caller's own client record (the web app only knows the user id). */
  @Get('me/overview')
  async getMyOverview(@Request() req: any) {
    const client =
      (await this.wpService.findClientByUserId(req.user.sub)) ??
      (req.user.email ? await this.wpService.findClientByEmail(req.user.email) : null);
    if (!client) throw new NotFoundException('No client enrollment found for this account');
    return this.wpService.getClientPortalOverview(client.id);
  }

  @Get(':clientId/overview')
  async getClientPortalOverview(@Param('clientId') clientId: string, @Request() req: any) {
    await this.assertClientAccess(clientId, req.user);
    return this.wpService.getClientPortalOverview(clientId);
  }

  @Get(':clientId/settlements')
  async getClientSettlements(@Param('clientId') clientId: string, @Request() req: any) {
    await this.assertClientAccess(clientId, req.user);
    return this.wpService.getClientSettlements(clientId);
  }

  @Get(':clientId/payments')
  async getClientPayments(
    @Param('clientId') clientId: string,
    @Query('limit') limit: number,
    @Request() req: any,
  ) {
    await this.assertClientAccess(clientId, req.user);
    return this.wpService.getClientPayments(clientId, limit ?? 50);
  }

  @Get(':clientId/milestones')
  async getClientMilestones(@Param('clientId') clientId: string, @Request() req: any) {
    await this.assertClientAccess(clientId, req.user);
    return this.wpService.getClientMilestones(clientId);
  }

  @Get(':clientId/documents')
  async getClientDocuments(@Param('clientId') clientId: string, @Request() req: any) {
    await this.assertClientAccess(clientId, req.user);
    return this.wpService.getClientDocuments(clientId);
  }

  @Get(':clientId/notifications')
  async getClientNotifications(
    @Param('clientId') clientId: string,
    @Query('isRead') isRead: string,
    @Request() req: any,
  ) {
    await this.assertClientAccess(clientId, req.user);
    const readBool = isRead === 'true' ? true : isRead === 'false' ? false : undefined;
    return this.wpService.getClientNotifications(clientId, readBool);
  }

  @Get(':clientId/trust-account')
  async getClientTrustAccount(@Param('clientId') clientId: string, @Request() req: any) {
    await this.assertClientAccess(clientId, req.user);
    return this.wpService.getClientTrustAccount(clientId);
  }
}
