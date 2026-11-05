import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { Lead } from '../entities/lead.entity';
import { ProvidersModule } from '../providers/providers.module';
import { MatchingModule } from '../matching/matching.module';
import { AiModule } from '../ai/ai.module';
import { EmailModule } from '../email/email.module';
import { CrmModule } from '../crm/crm.module';
import { CloseFlowModule } from '../close-flow/close-flow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead]),
    ProvidersModule,
    MatchingModule,
    AiModule,
    EmailModule,
    CrmModule,
    CloseFlowModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}