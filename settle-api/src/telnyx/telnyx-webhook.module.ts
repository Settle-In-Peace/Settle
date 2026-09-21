import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelnyxWebhookController } from './telnyx-webhook.controller';
import { TelnyxWebhookService } from './telnyx-webhook.service';
import { CallLog } from '../entities/call-log.entity';
import { CommunicationLog } from '../entities/communication-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CallLog, CommunicationLog])],
  controllers: [TelnyxWebhookController],
  providers: [TelnyxWebhookService],
  exports: [TelnyxWebhookService],
})
export class TelnyxWebhookModule {}
