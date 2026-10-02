/**
 * DialerModule — provider-agnostic outbound dialing for debt collection.
 *
 * ORCHESTRATOR WIRING (do not commit inside this module):
 *   // app.module.ts
 *   import { DialerModule } from './dialer/dialer.module';
 *   import { DialerCall } from './dialer/dialer-call.entity';
 *   // add `DialerCall` to the TypeOrmModule.forRoot `entities` array,
 *   // add `DialerCall` to the TypeOrmModule.forFeature([...]) list, and
 *   // add `DialerModule` to `imports`. (autoLoadEntities covers runtime, but
 *   // keep the explicit lists consistent.)
 *
 *   // data-source.ts — add `DialerCall` to the `entities` array.
 *
 *   // migrations/run-migration.ts — append:
 *   import { CreateDialerCalls1700000000033 } from './1700000000033-CreateDialerCalls';
 *   // and `CreateDialerCalls1700000000033` at the end of the migrations array.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DialerCall } from './dialer-call.entity';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog } from '../entities/consent-log.entity';
import { DebtorProfile } from '../entities/debtor-profile.entity';
import { DialerController } from './dialer.controller';
import { DialerWebhookController } from './dialer-webhook.controller';
import { DialerService } from './dialer.service';
import { TelnyxDialerProvider } from './providers/telnyx-dialer.provider';
import { VicidialProvider } from './providers/vicidial.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([DialerCall, DncEntry, ConsentLog, DebtorProfile]),
  ],
  controllers: [DialerController, DialerWebhookController],
  providers: [DialerService, TelnyxDialerProvider, VicidialProvider],
  exports: [DialerService],
})
export class DialerModule {}
