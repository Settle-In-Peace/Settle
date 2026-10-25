import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WorkflowPortalService } from './workflow-portal.service';
import { WorkflowTrigger, WorkflowActionType } from '../entities/workflow-rule.entity';
import { WorkflowExecutionStatus } from '../entities/workflow-execution.entity';
import { NotificationType, NotificationChannel, NotificationTargetRole } from '../entities/crm-notification.entity';
import { MilestoneType } from '../entities/milestone.entity';
import { DocumentType, DocumentStatus } from '../entities/crm-document.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('crm')
@UseGuards(JwtAuthGuard, AdminGuard)
export class WorkflowPortalController {
  constructor(private readonly wpService: WorkflowPortalService) {}

  // ===========================================================================
  // WORKFLOW RULES
  // ===========================================================================

  @Get('workflow/rules')
  async listWorkflowRules(@Query('groupId') groupId?: string) {
    return this.wpService.listWorkflowRules(groupId);
  }

  @Post('workflow/rules')
  async createWorkflowRule(@Body() body: Record<string, unknown>) {
    return this.wpService.createWorkflowRule(body);
  }

  @Patch('workflow/rules/:id')
  async updateWorkflowRule(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.wpService.updateWorkflowRule(id, body);
  }

  @Post('workflow/trigger')
  async triggerWorkflow(
    @Body('trigger') trigger: WorkflowTrigger,
    @Body() context: {
      leadId?: string;
      clientId?: string;
      enrollmentId?: string;
      settlementId?: string;
      data?: Record<string, any>;
      groupId?: string;
    },
  ) {
    return this.wpService.triggerWorkflow(trigger, context);
  }

  @Get('workflow/executions')
  async getWorkflowExecutions(
    @Query('ruleId') ruleId?: string,
    @Query('status') status?: WorkflowExecutionStatus,
    @Query('limit') limit?: number,
  ) {
    return this.wpService.getWorkflowExecutions(ruleId, status, limit ?? 50);
  }

  // ===========================================================================
  // NOTIFICATIONS / ALERTS
  // ===========================================================================

  @Get('notifications')
  async getNotifications(
    @Query('userId') userId?: string,
    @Query('targetRole') targetRole?: NotificationTargetRole,
    @Query('isRead') isRead?: string,
    @Query('limit') limit?: number,
  ) {
    const readBool = isRead === 'true' ? true : isRead === 'false' ? false : undefined;
    return this.wpService.getNotifications(userId, targetRole, readBool, limit ?? 50);
  }

  @Post('notifications')
  async createNotification(@Body() body: {
    userId?: string;
    targetRole?: NotificationTargetRole;
    type: NotificationType;
    channel?: NotificationChannel;
    title: string;
    message: string;
    leadId?: string;
    clientId?: string;
    enrollmentId?: string;
    settlementId?: string;
    actionUrl?: { url: string; label: string };
    groupId?: string;
  }) {
    return this.wpService.createNotification(body);
  }

  @Post('notifications/:id/read')
  async markNotificationRead(@Param('id') id: string) {
    return this.wpService.markNotificationRead(id);
  }

  @Post('notifications/read-all')
  async markAllNotificationsRead(@Body('userId') userId?: string) {
    await this.wpService.markAllNotificationsRead(userId);
    return { success: true };
  }

  @Get('notifications/unread-count')
  async getUnreadCount(
    @Query('userId') userId?: string,
    @Query('targetRole') targetRole?: NotificationTargetRole,
  ) {
    const count = await this.wpService.getUnreadCount(userId, targetRole);
    return { count };
  }

  @Post('alerts/generate')
  async generateAlerts(@Query('groupId') groupId?: string) {
    return this.wpService.generateAlerts(groupId);
  }

  // ===========================================================================
  // MILESTONES
  // ===========================================================================

  @Get('milestones')
  async listMilestones(
    @Query('enrollmentId') enrollmentId?: string,
    @Query('clientId') clientId?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.wpService.listMilestones(enrollmentId, clientId, groupId);
  }

  @Post('milestones')
  async createMilestone(@Body() body: {
    enrollmentId: string;
    clientId: string;
    milestoneType: MilestoneType;
    title: string;
    description?: string;
    sortOrder?: number;
    progressThreshold?: number;
    targetDate?: Date;
    triggerActions?: any[];
    clientVisible?: boolean;
    groupId?: string;
  }) {
    return this.wpService.createMilestone(body);
  }

  @Post('milestones/:id/reach')
  async reachMilestone(@Param('id') id: string) {
    return this.wpService.reachMilestone(id);
  }

  @Post('milestones/check-progress/:enrollmentId')
  async checkMilestoneProgress(@Param('enrollmentId') enrollmentId: string) {
    await this.wpService.checkMilestoneProgress(enrollmentId);
    return { success: true };
  }

  @Post('milestones/default/:enrollmentId')
  async createDefaultMilestones(
    @Param('enrollmentId') enrollmentId: string,
    @Body('clientId') clientId: string,
    @Body('groupId') groupId?: string,
  ) {
    return this.wpService.createDefaultMilestones(enrollmentId, clientId, groupId);
  }

  // ===========================================================================
  // DOCUMENTS
  // ===========================================================================

  @Get('documents')
  async listDocuments(
    @Query('clientId') clientId?: string,
    @Query('enrollmentId') enrollmentId?: string,
    @Query('settlementId') settlementId?: string,
    @Query('type') type?: DocumentType,
    @Query('status') status?: DocumentStatus,
    @Query('groupId') groupId?: string,
  ) {
    return this.wpService.listDocuments(clientId, enrollmentId, settlementId, type, status, groupId);
  }

  @Get('documents/:id')
  async getDocument(@Param('id') id: string) {
    return this.wpService.getDocument(id);
  }

  @Post('documents')
  async uploadDocument(@Body() body: {
    documentType: DocumentType;
    title: string;
    description?: string;
    fileUrl: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    clientId: string;
    enrollmentId?: string;
    settlementId?: string;
    creditorId?: string;
    uploadedBy: string;
    groupId?: string;
    metadata?: Record<string, any>;
  }) {
    return this.wpService.uploadDocument(body);
  }

  @Post('documents/:id/viewed')
  async markDocumentViewed(@Param('id') id: string) {
    return this.wpService.markDocumentViewed(id);
  }

  @Post('documents/:id/sign')
  async signDocument(
    @Param('id') id: string,
    @Body('signatureIp') signatureIp?: string,
    @Body('signatureUserAgent') signatureUserAgent?: string,
  ) {
    return this.wpService.signDocument(id, signatureIp, signatureUserAgent);
  }

  // CLIENT PORTAL routes moved to client-portal.controller.ts —
  // @Controller('crm/portal'). They were unreachable here: the class-level
  // AdminGuard blocked the consumers they were built for.
}
