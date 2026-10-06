import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Activity } from './entities/activity.entity';
import { Debt } from './entities/debt.entity';
import { Provider } from './entities/provider.entity';
import { Lead } from './entities/lead.entity';
import { Match } from './entities/match.entity';
import { Budget } from './entities/budget.entity';
import { BudgetItem } from './entities/budget-item.entity';
import { Goal } from './entities/goal.entity';
import { CoachingSubscription } from './entities/coaching-subscription.entity';
import { CrmLead } from './entities/crm-lead.entity';
import { CrmDeal } from './entities/crm-deal.entity';
import { CrmClient } from './entities/crm-client.entity';
import { Deposit } from './entities/deposit.entity';
import { CollectionAccount } from './entities/collection-account.entity';
import { DebtorProfile } from './entities/debtor-profile.entity';
import { CollectionNote } from './entities/collection-note.entity';
import { SkipTraceResult } from './entities/skip-trace-result.entity';
import { CallLog } from './entities/call-log.entity';
import { CreditReport } from './entities/credit-report.entity';
import { BackgroundCheck } from './entities/background-check.entity';
import { DialerCall } from './dialer/dialer-call.entity';
import { LeadVendorAccount } from './entities/lead-vendor-account.entity';
import { LeadImportBatch } from './entities/lead-import-batch.entity';
import { LeadPurchase } from './entities/lead-purchase.entity';
import { ProcessorPayment } from './entities/processor-payment.entity';
import { FeatureRequest } from './feedback/feature-request.entity';
import { FeatureRequestVote } from './feedback/feature-request-vote.entity';
import { QaQuestion } from './questions/qa-question.entity';
import { QaAnswer } from './questions/qa-answer.entity';

export const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // Match the SSL logic used by AppModule so the migration runner works on
  // Render (and any host) — not just Railway. If a custom CA is provided, use
  // it; otherwise allow self-signed certificates which Render requires.
  ssl: process.env.DATABASE_SSL_CA
    ? { ca: process.env.DATABASE_SSL_CA }
    : { rejectUnauthorized: false },
  entities: [
    User,
    Activity,
    Debt,
    Provider,
    Lead,
    Match,
    Budget,
    BudgetItem,
    Goal,
    CoachingSubscription,
    CrmLead,
    CrmDeal,
    CrmClient,
    Deposit,
    CollectionAccount,
    DebtorProfile,
    CollectionNote,
    SkipTraceResult,
    CallLog,
    CreditReport,
    BackgroundCheck,
    DialerCall,
    LeadVendorAccount,
    LeadImportBatch,
    LeadPurchase,
    ProcessorPayment,
    FeatureRequest,
    FeatureRequestVote,
    QaQuestion,
    QaAnswer,
  ],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
