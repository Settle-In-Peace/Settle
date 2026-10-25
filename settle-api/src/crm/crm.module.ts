import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { DebtSettlementController } from './debt-settlement.controller';
import { DebtSettlementService } from './debt-settlement.service';
import { WorkflowPortalController } from './workflow-portal.controller';
import { ClientPortalController } from './client-portal.controller';
import { WorkflowPortalService } from './workflow-portal.service';
import { CrmLead } from '../entities/crm-lead.entity';
import { CrmDeal } from '../entities/crm-deal.entity';
import { CrmClient } from '../entities/crm-client.entity';
import { Creditor } from '../entities/creditor.entity';
import { ClientEnrollment } from '../entities/client-enrollment.entity';
import { Settlement } from '../entities/settlement.entity';
import { TrustAccount } from '../entities/trust-account.entity';
import { SettlementPayment } from '../entities/settlement-payment.entity';
import { LeadRoutingRule } from '../entities/lead-routing-rule.entity';
import { LeadAssignment } from '../entities/lead-assignment.entity';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog } from '../entities/consent-log.entity';
import { CommunicationLog } from '../entities/communication-log.entity';
import { CrmTask } from '../entities/crm-task.entity';
import { Lead } from '../entities/lead.entity';
import { WorkflowRule } from '../entities/workflow-rule.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { CrmNotification } from '../entities/crm-notification.entity';
import { Milestone } from '../entities/milestone.entity';
import { CrmDocument } from '../entities/crm-document.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CrmLead,
      CrmDeal,
      CrmClient,
      Creditor,
      ClientEnrollment,
      Settlement,
      TrustAccount,
      SettlementPayment,
      LeadRoutingRule,
      LeadAssignment,
      DncEntry,
      ConsentLog,
      CommunicationLog,
      CrmTask,
      Lead,
      WorkflowRule,
      WorkflowExecution,
      CrmNotification,
      Milestone,
      CrmDocument,
    ]),
    AuthModule,
  ],
  controllers: [CrmController, DebtSettlementController, WorkflowPortalController, ClientPortalController],
  providers: [CrmService, DebtSettlementService, WorkflowPortalService],
  exports: [CrmService, DebtSettlementService, WorkflowPortalService],
})
export class CrmModule {}
