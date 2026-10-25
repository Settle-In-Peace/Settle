import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, MoreThan, Between } from 'typeorm';
import {
  WorkflowRule,
  WorkflowTrigger,
  WorkflowActionType,
} from '../entities/workflow-rule.entity';
import {
  WorkflowExecution,
  WorkflowExecutionStatus,
} from '../entities/workflow-execution.entity';
import {
  CrmNotification,
  NotificationType,
  NotificationChannel,
  NotificationTargetRole,
} from '../entities/crm-notification.entity';
import {
  Milestone,
  MilestoneType,
  MilestoneStatus,
} from '../entities/milestone.entity';
import {
  CrmDocument,
  DocumentType,
  DocumentStatus,
} from '../entities/crm-document.entity';
import { ClientEnrollment, EnrollmentStatus } from '../entities/client-enrollment.entity';
import { Settlement, SettlementStatus } from '../entities/settlement.entity';
import { SettlementPayment, SettlementPaymentStatus } from '../entities/settlement-payment.entity';
import { TrustAccount } from '../entities/trust-account.entity';
import { CrmClient } from '../entities/crm-client.entity';
import { CrmTask, TaskType, TaskPriority, TaskStatus } from '../entities/crm-task.entity';

@Injectable()
export class WorkflowPortalService {
  private readonly logger = new Logger(WorkflowPortalService.name);

  constructor(
    @InjectRepository(WorkflowRule)
    private readonly ruleRepository: Repository<WorkflowRule>,
    @InjectRepository(WorkflowExecution)
    private readonly executionRepository: Repository<WorkflowExecution>,
    @InjectRepository(CrmNotification)
    private readonly notificationRepository: Repository<CrmNotification>,
    @InjectRepository(Milestone)
    private readonly milestoneRepository: Repository<Milestone>,
    @InjectRepository(CrmDocument)
    private readonly documentRepository: Repository<CrmDocument>,
    @InjectRepository(ClientEnrollment)
    private readonly enrollmentRepository: Repository<ClientEnrollment>,
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
    @InjectRepository(SettlementPayment)
    private readonly paymentRepository: Repository<SettlementPayment>,
    @InjectRepository(TrustAccount)
    private readonly trustAccountRepository: Repository<TrustAccount>,
    @InjectRepository(CrmClient)
    private readonly clientRepository: Repository<CrmClient>,
    @InjectRepository(CrmTask)
    private readonly taskRepository: Repository<CrmTask>,
  ) {}

  /** Fetch a CRM client by id — used by portal access checks. */
  async getClient(clientId: string): Promise<CrmClient | null> {
    return this.clientRepository.findOne({ where: { id: clientId } });
  }

  /** Resolve the CRM client belonging to a user account (portal self-access). */
  async findClientByUserId(userId: string): Promise<CrmClient | null> {
    return this.clientRepository.findOne({ where: { userId } });
  }

  /** Fallback: resolve a CRM client by verified account email (leads captured before signup). */
  async findClientByEmail(email: string): Promise<CrmClient | null> {
    return this.clientRepository.findOne({ where: { email } });
  }

  // ===========================================================================
  // WORKFLOW ENGINE
  // ===========================================================================

  async listWorkflowRules(groupId?: string): Promise<WorkflowRule[]> {
    const where: Record<string, unknown> = {};
    if (groupId) where.groupId = groupId;
    return this.ruleRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async createWorkflowRule(input: Partial<WorkflowRule>): Promise<WorkflowRule> {
    const rule = this.ruleRepository.create(input);
    const saved = await this.ruleRepository.save(rule);
    this.logger.log(`Created workflow rule ${saved.id} — ${saved.name} (trigger: ${saved.triggerEvent})`);
    return saved;
  }

  async updateWorkflowRule(ruleId: string, updates: Partial<WorkflowRule>): Promise<WorkflowRule> {
    const rule = await this.ruleRepository.findOne({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException(`Workflow rule ${ruleId} not found`);
    Object.assign(rule, updates);
    return this.ruleRepository.save(rule);
  }

  async triggerWorkflow(
    trigger: WorkflowTrigger,
    context: {
      leadId?: string;
      clientId?: string;
      enrollmentId?: string;
      settlementId?: string;
      data?: Record<string, any>;
      groupId?: string;
    },
  ): Promise<WorkflowExecution[]> {
    const where: Record<string, unknown> = {
      triggerEvent: trigger,
      isActive: true,
    };
    if (context.groupId) where.groupId = context.groupId;

    const rules = await this.ruleRepository.find({ where });
    if (rules.length === 0) return [];

    const executions: WorkflowExecution[] = [];

    for (const rule of rules) {
      if (!this.matchesConditions(rule.triggerConditions, context.data)) continue;

      const execution = this.executionRepository.create({
        ruleId: rule.id,
        status: WorkflowExecutionStatus.RUNNING,
        triggerData: context.data,
        leadId: context.leadId,
        clientId: context.clientId,
        enrollmentId: context.enrollmentId,
        settlementId: context.settlementId,
        triggeredAt: new Date(),
        groupId: context.groupId,
      });
      const saved = await this.executionRepository.save(execution);

      const actionResults: any[] = [];
      for (const action of rule.actions) {
        try {
          const result = await this.executeAction(action, context);
          actionResults.push({
            actionType: action.type,
            success: true,
            result,
            executedAt: new Date(),
          });
        } catch (err) {
          actionResults.push({
            actionType: action.type,
            success: false,
            error: (err as Error).message,
            executedAt: new Date(),
          });
          this.logger.error(`Workflow action ${action.type} failed: ${(err as Error).message}`);
        }
      }

      saved.actionResults = actionResults;
      saved.status = WorkflowExecutionStatus.COMPLETED;
      saved.completedAt = new Date();
      await this.executionRepository.save(saved);

      rule.executionCount += 1;
      await this.ruleRepository.save(rule);

      executions.push(saved);
    }

    this.logger.log(`Triggered ${trigger} — ${executions.length} rules executed`);
    return executions;
  }

  private matchesConditions(conditions?: Record<string, any>, data?: Record<string, any>): boolean {
    if (!conditions) return true;
    if (!data) return false;
    for (const [key, value] of Object.entries(conditions)) {
      if (data[key] !== value) return false;
    }
    return true;
  }

  private async executeAction(
    action: { type: WorkflowActionType; config: Record<string, any>; delayMinutes?: number },
    context: { leadId?: string; clientId?: string; enrollmentId?: string; settlementId?: string; groupId?: string },
  ): Promise<any> {
    switch (action.type) {
      case WorkflowActionType.SEND_EMAIL:
        this.logger.log(`Email action: template=${action.config.templateId}, to=${action.config.recipient}`);
        return { sent: true, template: action.config.templateId };

      case WorkflowActionType.SEND_SMS:
        this.logger.log(`SMS action: template=${action.config.templateId}, to=${action.config.recipient}`);
        return { sent: true };

      case WorkflowActionType.CREATE_TASK:
        const task = await this.taskRepository.save(
          this.taskRepository.create({
            type: (action.config.taskType as TaskType) ?? TaskType.GENERAL,
            title: action.config.title ?? 'Workflow-generated task',
            description: action.config.description,
            assignedTo: action.config.assignedTo ?? 'unassigned',
            dueDate: new Date(Date.now() + (action.config.dueInHours ?? 24) * 60 * 60 * 1000),
            leadId: context.leadId,
            clientId: context.clientId,
            enrollmentId: context.enrollmentId,
            settlementId: context.settlementId,
            priority: (action.config.priority as TaskPriority) ?? TaskPriority.MEDIUM,
            status: TaskStatus.PENDING,
            groupId: context.groupId,
          }),
        );
        return { taskId: task.id };

      case WorkflowActionType.NOTIFY_AGENT:
        const agentNotif = await this.createNotification({
          userId: action.config.agentId,
          type: NotificationType.INFO,
          channel: NotificationChannel.IN_APP,
          title: action.config.title ?? 'Workflow notification',
          message: action.config.message,
          leadId: context.leadId,
          clientId: context.clientId,
          enrollmentId: context.enrollmentId,
          settlementId: context.settlementId,
          groupId: context.groupId,
        });
        return { notificationId: agentNotif.id };

      case WorkflowActionType.NOTIFY_CLIENT:
        const clientNotif = await this.createNotification({
          targetRole: NotificationTargetRole.CLIENT,
          type: NotificationType.INFO,
          channel: action.config.channel ?? NotificationChannel.IN_APP,
          title: action.config.title ?? 'Update on your program',
          message: action.config.message,
          clientId: context.clientId,
          enrollmentId: context.enrollmentId,
          groupId: context.groupId,
        });
        return { notificationId: clientNotif.id };

      case WorkflowActionType.UPDATE_LEAD_STATUS:
        return { updated: true, status: action.config.newStatus };

      case WorkflowActionType.CREATE_DOCUMENT:
        const doc = await this.documentRepository.save(
          this.documentRepository.create({
            documentType: (action.config.documentType as DocumentType) ?? DocumentType.OTHER,
            title: action.config.title ?? 'Workflow-generated document',
            fileUrl: action.config.fileUrl ?? '',
            clientId: context.clientId ?? '',
            enrollmentId: context.enrollmentId,
            settlementId: context.settlementId,
            uploadedBy: action.config.uploadedBy ?? 'system',
            status: DocumentStatus.DRAFT,
            groupId: context.groupId,
          }),
        );
        return { documentId: doc.id };

      case WorkflowActionType.TRIGGER_WEBHOOK:
        this.logger.log(`Webhook action: url=${action.config.webhookUrl}`);
        return { triggered: true, url: action.config.webhookUrl };

      default:
        return { skipped: true };
    }
  }

  async getWorkflowExecutions(
    ruleId?: string,
    status?: WorkflowExecutionStatus,
    limit: number = 50,
  ): Promise<WorkflowExecution[]> {
    const where: Record<string, unknown> = {};
    if (ruleId) where.ruleId = ruleId;
    if (status) where.status = status;
    return this.executionRepository.find({ where, order: { triggeredAt: 'DESC' }, take: limit });
  }

  // ===========================================================================
  // NOTIFICATIONS / ALERTS
  // ===========================================================================

  async createNotification(input: {
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
  }): Promise<CrmNotification> {
    const notif = this.notificationRepository.create({
      userId: input.userId,
      targetRole: input.targetRole,
      type: input.type,
      notificationChannel: input.channel ?? NotificationChannel.IN_APP,
      title: input.title,
      message: input.message,
      leadId: input.leadId,
      clientId: input.clientId,
      enrollmentId: input.enrollmentId,
      settlementId: input.settlementId,
      actionUrl: input.actionUrl,
      groupId: input.groupId,
    });
    return this.notificationRepository.save(notif);
  }

  async getNotifications(
    userId?: string,
    targetRole?: NotificationTargetRole,
    isRead?: boolean,
    limit: number = 50,
  ): Promise<CrmNotification[]> {
    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (targetRole) where.targetRole = targetRole;
    if (isRead !== undefined) where.isRead = isRead;
    return this.notificationRepository.find({ where, order: { createdAt: 'DESC' }, take: limit });
  }

  async markNotificationRead(notificationId: string): Promise<CrmNotification> {
    const notif = await this.notificationRepository.findOne({ where: { id: notificationId } });
    if (!notif) throw new NotFoundException(`Notification ${notificationId} not found`);
    notif.isRead = true;
    notif.readAt = new Date();
    return this.notificationRepository.save(notif);
  }

  async markAllNotificationsRead(userId?: string): Promise<void> {
    const where: Record<string, unknown> = { isRead: false };
    if (userId) where.userId = userId;
    await this.notificationRepository.update(where, {
      isRead: true,
      readAt: new Date(),
    });
  }

  async getUnreadCount(userId?: string, targetRole?: NotificationTargetRole): Promise<number> {
    const where: Record<string, unknown> = { isRead: false };
    if (userId) where.userId = userId;
    if (targetRole) where.targetRole = targetRole;
    return this.notificationRepository.count({ where });
  }

  // Alert generation for expiring offers, missed payments, dropout risk
  async generateAlerts(groupId?: string): Promise<CrmNotification[]> {
    const alerts: CrmNotification[] = [];

    // 1. Expiring settlement offers (within 7 days)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const offerSettlements = await this.settlementRepository.find({
      where: { status: SettlementStatus.OFFER_MADE },
    });
    for (const s of offerSettlements) {
      if (s.offerDate) {
        const offerAge = (Date.now() - s.offerDate.getTime()) / (1000 * 60 * 60 * 24);
        if (offerAge > 21) {
          const alert = await this.createNotification({
            type: NotificationType.WARNING,
            title: 'Settlement offer expiring soon',
            message: `Settlement ${s.id} for client ${s.clientId} has an offer that is ${Math.round(offerAge)} days old. Creditor may withdraw.`,
            clientId: s.clientId,
            settlementId: s.id,
            actionUrl: { url: `/crm/settlements/${s.id}`, label: 'View Settlement' },
            groupId,
          });
          alerts.push(alert);
        }
      }
    }

    // 2. Missed payments (scheduled but not processed past due date)
    const overduePayments = await this.paymentRepository.find({
      where: {
        status: SettlementPaymentStatus.SCHEDULED,
        scheduledDate: LessThan(new Date()),
      },
    });
    for (const p of overduePayments) {
      const alert = await this.createNotification({
        type: NotificationType.URGENT,
        title: 'Missed payment',
        message: `Payment of $${p.amount} for client ${p.clientId} was scheduled for ${p.scheduledDate?.toISOString().split('T')[0]} but not processed.`,
        clientId: p.clientId,
        actionUrl: { url: `/crm/payments/${p.id}`, label: 'View Payment' },
        groupId,
      });
      alerts.push(alert);
    }

    // 3. Dropout risk — clients with no communication in 30+ days and active enrollment
    const activeEnrollments = await this.enrollmentRepository.find({
      where: { status: EnrollmentStatus.ACTIVE },
    });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const e of activeEnrollments) {
      const lastContact = e.updatedAt;
      if (lastContact && lastContact < thirtyDaysAgo) {
        const alert = await this.createNotification({
          type: NotificationType.WARNING,
          title: 'Client dropout risk',
          message: `Client ${e.clientId} enrolled on ${e.enrollmentDate?.toISOString().split('T')[0]} has had no activity in 30+ days. Consider outreach.`,
          clientId: e.clientId,
          enrollmentId: e.id,
          actionUrl: { url: `/crm/enrollments/${e.id}`, label: 'View Enrollment' },
          groupId,
        });
        alerts.push(alert);
      }
    }

    this.logger.log(`Generated ${alerts.length} alerts`);
    return alerts;
  }

  // ===========================================================================
  // MILESTONE TRACKING
  // ===========================================================================

  async listMilestones(enrollmentId?: string, clientId?: string, groupId?: string): Promise<Milestone[]> {
    const where: Record<string, unknown> = {};
    if (enrollmentId) where.enrollmentId = enrollmentId;
    if (clientId) where.clientId = clientId;
    if (groupId) where.groupId = groupId;
    return this.milestoneRepository.find({ where, order: { sortOrder: 'ASC' } });
  }

  async createMilestone(input: {
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
  }): Promise<Milestone> {
    const milestone = this.milestoneRepository.create({
      enrollmentId: input.enrollmentId,
      clientId: input.clientId,
      milestoneType: input.milestoneType,
      title: input.title,
      description: input.description,
      sortOrder: input.sortOrder ?? 0,
      progressThreshold: input.progressThreshold,
      targetDate: input.targetDate,
      triggerActions: input.triggerActions,
      clientVisible: input.clientVisible ?? true,
      status: MilestoneStatus.PENDING,
      groupId: input.groupId,
    });
    const saved = await this.milestoneRepository.save(milestone);
    this.logger.log(`Created milestone ${saved.id} — ${saved.title}`);
    return saved;
  }

  async reachMilestone(milestoneId: string): Promise<Milestone> {
    const milestone = await this.milestoneRepository.findOne({ where: { id: milestoneId } });
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneId} not found`);

    milestone.status = MilestoneStatus.REACHED;
    milestone.reachedDate = new Date();
    await this.milestoneRepository.save(milestone);

    // Trigger workflow
    await this.triggerWorkflow(WorkflowTrigger.MILESTONE_REACHED, {
      clientId: milestone.clientId,
      enrollmentId: milestone.enrollmentId,
      data: { milestoneType: milestone.milestoneType, milestoneTitle: milestone.title },
      groupId: milestone.groupId,
    });

    // Execute trigger actions
    if (milestone.triggerActions) {
      for (const action of milestone.triggerActions) {
        this.logger.log(`Milestone action: ${action.type} for milestone ${milestoneId}`);
      }
    }

    return milestone;
  }

  async checkMilestoneProgress(enrollmentId: string): Promise<void> {
    const enrollment = await this.enrollmentRepository.findOne({ where: { id: enrollmentId } });
    if (!enrollment) return;

    const progressPercent =
      enrollment.totalAccountsEnrolled > 0
        ? (enrollment.totalAccountsSettled / enrollment.totalAccountsEnrolled) * 100
        : 0;

    const milestones = await this.milestoneRepository.find({
      where: { enrollmentId, status: MilestoneStatus.PENDING },
    });

    for (const m of milestones) {
      if (m.progressThreshold != null && progressPercent >= Number(m.progressThreshold)) {
        await this.reachMilestone(m.id);
      }
    }
  }

  async createDefaultMilestones(enrollmentId: string, clientId: string, groupId?: string): Promise<Milestone[]> {
    const defaults: { type: MilestoneType; title: string; threshold: number; order: number }[] = [
      { type: MilestoneType.ENROLLMENT, title: 'Enrollment Complete', threshold: 0, order: 0 },
      { type: MilestoneType.FIRST_PAYMENT, title: 'First Program Payment', threshold: 0, order: 1 },
      { type: MilestoneType.FIRST_SETTLEMENT, title: 'First Debt Settled', threshold: 1, order: 2 },
      { type: MilestoneType.QUARTER_SETTLED, title: '25% of Debts Settled', threshold: 25, order: 3 },
      { type: MilestoneType.HALF_SETTLED, title: '50% of Debts Settled', threshold: 50, order: 4 },
      { type: MilestoneType.THREE_QUARTER_SETTLED, title: '75% of Debts Settled', threshold: 75, order: 5 },
      { type: MilestoneType.ALL_SETTLED, title: 'All Debts Settled', threshold: 100, order: 6 },
      { type: MilestoneType.PROGRAM_COMPLETION, title: 'Program Completion', threshold: 100, order: 7 },
    ];

    const milestones: Milestone[] = [];
    for (const d of defaults) {
      const m = await this.createMilestone({
        enrollmentId,
        clientId,
        milestoneType: d.type,
        title: d.title,
        sortOrder: d.order,
        progressThreshold: d.threshold,
        clientVisible: true,
        groupId,
      });
      milestones.push(m);
    }
    return milestones;
  }

  // ===========================================================================
  // DOCUMENT MANAGEMENT
  // ===========================================================================

  async listDocuments(
    clientId?: string,
    enrollmentId?: string,
    settlementId?: string,
    type?: DocumentType,
    status?: DocumentStatus,
    groupId?: string,
  ): Promise<CrmDocument[]> {
    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (enrollmentId) where.enrollmentId = enrollmentId;
    if (settlementId) where.settlementId = settlementId;
    if (type) where.documentType = type;
    if (status) where.status = status;
    if (groupId) where.groupId = groupId;
    return this.documentRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async getDocument(documentId: string): Promise<CrmDocument> {
    const doc = await this.documentRepository.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return doc;
  }

  async uploadDocument(input: {
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
  }): Promise<CrmDocument> {
    const doc = this.documentRepository.create({
      documentType: input.documentType,
      title: input.title,
      description: input.description,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      clientId: input.clientId,
      enrollmentId: input.enrollmentId,
      settlementId: input.settlementId,
      creditorId: input.creditorId,
      uploadedBy: input.uploadedBy,
      status: DocumentStatus.SENT,
      sentAt: new Date(),
      metadata: input.metadata,
      groupId: input.groupId,
    });
    const saved = await this.documentRepository.save(doc);
    this.logger.log(`Uploaded document ${saved.id} — ${saved.title}`);
    return saved;
  }

  async markDocumentViewed(documentId: string): Promise<CrmDocument> {
    const doc = await this.getDocument(documentId);
    if (doc.status === DocumentStatus.SENT) {
      doc.status = DocumentStatus.VIEWED;
      doc.viewedAt = new Date();
    }
    return this.documentRepository.save(doc);
  }

  async signDocument(documentId: string, signatureIp?: string, signatureUserAgent?: string): Promise<CrmDocument> {
    const doc = await this.getDocument(documentId);
    doc.status = DocumentStatus.SIGNED;
    doc.signedAt = new Date();
    doc.signatureIp = signatureIp;
    doc.signatureUserAgent = signatureUserAgent;

    // Trigger workflow
    await this.triggerWorkflow(WorkflowTrigger.DOCUMENT_SIGNED, {
      clientId: doc.clientId,
      enrollmentId: doc.enrollmentId,
      settlementId: doc.settlementId,
      data: { documentType: doc.documentType, documentTitle: doc.title },
      groupId: doc.groupId,
    });

    return this.documentRepository.save(doc);
  }

  // ===========================================================================
  // CLIENT PORTAL — Client-facing endpoints
  // ===========================================================================

  async getClientPortalOverview(clientId: string): Promise<{
    client: CrmClient;
    enrollment: ClientEnrollment | null;
    trustAccount: TrustAccount | null;
    settlements: Settlement[];
    recentPayments: SettlementPayment[];
    milestones: Milestone[];
    documents: CrmDocument[];
    progressPercent: number;
    unreadNotifications: number;
  }> {
    const client = await this.clientRepository.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);

    const enrollment = await this.enrollmentRepository.findOne({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });

    const trustAccount = enrollment
      ? await this.trustAccountRepository.findOne({ where: { enrollmentId: enrollment.id } })
      : null;

    const settlements = enrollment
      ? await this.settlementRepository.find({ where: { enrollmentId: enrollment.id }, order: { createdAt: 'DESC' } })
      : [];

    const recentPayments = await this.paymentRepository.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const milestones = enrollment
      ? await this.milestoneRepository.find({
          where: { enrollmentId: enrollment.id, clientVisible: true },
          order: { sortOrder: 'ASC' },
        })
      : [];

    const documents = await this.documentRepository.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });

    const progressPercent = enrollment && enrollment.totalAccountsEnrolled > 0
      ? (enrollment.totalAccountsSettled / enrollment.totalAccountsEnrolled) * 100
      : 0;

    const unreadNotifications = await this.notificationRepository.count({
      where: { clientId, isRead: false },
    });

    return {
      client,
      enrollment,
      trustAccount,
      settlements,
      recentPayments,
      milestones,
      documents,
      progressPercent: Math.round(progressPercent * 10) / 10,
      unreadNotifications,
    };
  }

  async getClientSettlements(clientId: string): Promise<Settlement[]> {
    return this.settlementRepository.find({ where: { clientId }, order: { createdAt: 'DESC' } });
  }

  async getClientPayments(clientId: string, limit: number = 50): Promise<SettlementPayment[]> {
    return this.paymentRepository.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getClientMilestones(clientId: string): Promise<Milestone[]> {
    return this.milestoneRepository.find({
      where: { clientId, clientVisible: true },
      order: { sortOrder: 'ASC' },
    });
  }

  async getClientDocuments(clientId: string): Promise<CrmDocument[]> {
    return this.documentRepository.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async getClientNotifications(clientId: string, isRead?: boolean): Promise<CrmNotification[]> {
    const where: Record<string, unknown> = { clientId };
    if (isRead !== undefined) where.isRead = isRead;
    return this.notificationRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async getClientTrustAccount(clientId: string): Promise<TrustAccount | null> {
    return this.trustAccountRepository.findOne({ where: { clientId } });
  }
}
