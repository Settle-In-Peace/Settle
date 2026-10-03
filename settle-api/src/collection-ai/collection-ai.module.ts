import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { CollectionAiController } from './collection-ai.controller';
import { CollectionAiService } from './collection-ai.service';
import { CollectionAccount } from '../entities/collection-account.entity';
import { CollectionNote } from '../entities/collection-note.entity';
import { CallLog } from '../entities/call-log.entity';
import { DebtorProfile } from '../entities/debtor-profile.entity';
import { CrmClient } from '../entities/crm-client.entity';

@Module({
  imports: [
    AiModule, // provides LlmClientService
    TypeOrmModule.forFeature([
      CollectionAccount,
      CollectionNote,
      CallLog,
      DebtorProfile,
      CrmClient,
    ]),
  ],
  controllers: [CollectionAiController],
  providers: [CollectionAiService],
  exports: [CollectionAiService],
})
export class CollectionAiModule {}
