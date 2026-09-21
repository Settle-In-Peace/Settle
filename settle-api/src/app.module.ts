import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './entities/user.entity';
import { Activity } from './entities/activity.entity';
import { Debt } from './entities/debt.entity';
import { Provider } from './entities/provider.entity';
import { Lead } from './entities/lead.entity';
import { Match } from './entities/match.entity';
import { Budget } from './entities/budget.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { BudgetItem } from './entities/budget-item.entity';
import { Goal } from './entities/goal.entity';
import { CoachingSubscription } from './entities/coaching-subscription.entity';
import { CrmLead } from './entities/crm-lead.entity';
import { CrmDeal } from './entities/crm-deal.entity';
import { CrmClient } from './entities/crm-client.entity';
import { Creditor } from './entities/creditor.entity';
import { ClientEnrollment } from './entities/client-enrollment.entity';
import { Settlement } from './entities/settlement.entity';
import { TrustAccount } from './entities/trust-account.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';
import { LeadRoutingRule } from './entities/lead-routing-rule.entity';
import { LeadAssignment } from './entities/lead-assignment.entity';
import { DncEntry } from './entities/dnc-entry.entity';
import { ConsentLog } from './entities/consent-log.entity';
import { CommunicationLog } from './entities/communication-log.entity';
import { CrmTask } from './entities/crm-task.entity';
import { WorkflowRule } from './entities/workflow-rule.entity';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { CrmNotification } from './entities/crm-notification.entity';
import { Milestone } from './entities/milestone.entity';
import { CrmDocument } from './entities/crm-document.entity';
import { CollectionAccount } from './entities/collection-account.entity';
import { DebtorProfile } from './entities/debtor-profile.entity';
import { CollectionNote } from './entities/collection-note.entity';
import { SkipTraceResult } from './entities/skip-trace-result.entity';
import { CallLog } from './entities/call-log.entity';
import { CreditReport } from './entities/credit-report.entity';
import { BackgroundCheck } from './entities/background-check.entity';
import { DebtPortfolio } from './entities/debt-portfolio.entity';
import { DebtPortfolioAccount } from './entities/debt-portfolio.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { PaymentPlanPayment } from './entities/payment-plan-payment.entity';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module';
import { DebtsModule } from './debts/debts.module';
import { ProvidersModule } from './providers/providers.module';
import { LeadsModule } from './leads/leads.module';
import { StripeModule } from './stripe/stripe.module';
import { AdminModule } from './admin/admin.module';
import { MatchingModule } from './matching/matching.module';
import { AiModule } from './ai/ai.module';
import { CoachingModule } from './coaching/coaching.module';
import { CrmModule } from './crm/crm.module';
import { BillingModule } from './billing/billing.module';
import { SalesModule } from './sales/sales.module';
import { CollectionsModule } from './collections/collections.module';
import { TelnyxWebhookModule } from './telnyx/telnyx-webhook.module';
import { ComplianceModule } from './compliance/compliance.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PaymentPlansModule } from './payment-plans/payment-plans.module';
import { PaymentPortalModule } from './payment-portal/payment-portal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 30,
    }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL_CA
        ? { ca: process.env.DATABASE_SSL_CA }
        : { rejectUnauthorized: false },
      extra: {
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        keepAlive: true,
      },
      entities: [User, Activity, Debt, Provider, Lead, Match, Budget, BudgetItem, Goal, CoachingSubscription, CrmLead, CrmDeal, CrmClient, Creditor, ClientEnrollment, Settlement, TrustAccount, SettlementPayment, LeadRoutingRule, LeadAssignment, DncEntry, ConsentLog, CommunicationLog, CrmTask, WorkflowRule, WorkflowExecution, CrmNotification, Milestone, CrmDocument, RefreshToken, CollectionAccount, DebtorProfile, CollectionNote, SkipTraceResult, CallLog, CreditReport, BackgroundCheck, DebtPortfolio, DebtPortfolioAccount, PaymentPlan, PaymentPlanPayment],
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
      autoLoadEntities: true,
      retryAttempts: 5,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature([User, Activity, Debt, Provider, Lead, Match, Budget, BudgetItem, Goal, CoachingSubscription, CrmLead, CrmDeal, CrmClient, Creditor, ClientEnrollment, Settlement, TrustAccount, SettlementPayment, LeadRoutingRule, LeadAssignment, DncEntry, ConsentLog, CommunicationLog, CrmTask, WorkflowRule, WorkflowExecution, CrmNotification, Milestone, CrmDocument, RefreshToken, CollectionAccount, DebtorProfile, CollectionNote, SkipTraceResult, CallLog, CreditReport, BackgroundCheck, DebtPortfolio, DebtPortfolioAccount, PaymentPlan, PaymentPlanPayment]),
    AuthModule,
    ActivitiesModule,
    DebtsModule,
    ProvidersModule,
    LeadsModule,
    StripeModule,
    AdminModule,
    MatchingModule,
    AiModule,
    CoachingModule,
    CrmModule,
    BillingModule,
    SalesModule,
    CollectionsModule,
    PortfolioModule,
    PaymentPlansModule,
    PaymentPortalModule,
    TelnyxWebhookModule,
    ComplianceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}