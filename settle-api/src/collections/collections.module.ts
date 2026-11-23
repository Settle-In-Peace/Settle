import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CollectionAccount } from '../entities/collection-account.entity';
import { CrmClient } from '../entities/crm-client.entity';
import { DebtorProfile } from '../entities/debtor-profile.entity';
import { CollectionNote } from '../entities/collection-note.entity';
import { SkipTraceResult } from '../entities/skip-trace-result.entity';
import { CallLog } from '../entities/call-log.entity';
import { CreditReport } from '../entities/credit-report.entity';
import { BackgroundCheck } from '../entities/background-check.entity';
import { User } from '../entities/user.entity';
import { PaymentPortalModule } from '../payment-portal/payment-portal.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [TypeOrmModule.forFeature([CollectionAccount, CrmClient, DebtorProfile, CollectionNote, SkipTraceResult, CallLog, CreditReport, BackgroundCheck, User]), PaymentPortalModule, EmailModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
