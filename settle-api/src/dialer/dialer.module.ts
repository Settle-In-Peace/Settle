/**
 * DialerModule — provider-agnostic outbound dialing for debt collection.
 *
 * Access: DialerAccessGuard allows platform sales/admin users OR DaaS
 * agents holding an active `seats` row (seats module). Calls are stamped
 * with org_id from the agent's seat for tenant attribution/usage rollups.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DialerCall } from './dialer-call.entity';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog } from '../entities/consent-log.entity';
import { DebtorProfile } from '../entities/debtor-profile.entity';
import { Org } from '../seats/org.entity';
import { Seat } from '../seats/seat.entity';
import { DialerController } from './dialer.controller';
import { DialerWebhookController } from './dialer-webhook.controller';
import { DialerService } from './dialer.service';
import { DialerAccessGuard } from './dialer-access.guard';
import { TelnyxDialerProvider } from './providers/telnyx-dialer.provider';
import { VicidialProvider } from './providers/vicidial.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([DialerCall, DncEntry, ConsentLog, DebtorProfile, Seat, Org]),
  ],
  controllers: [DialerController, DialerWebhookController],
  providers: [DialerService, DialerAccessGuard, TelnyxDialerProvider, VicidialProvider],
  exports: [DialerService],
})
export class DialerModule {}
