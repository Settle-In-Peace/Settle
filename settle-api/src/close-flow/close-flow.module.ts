import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloseFlowController } from './close-flow.controller';
import { CloseFlowService, CLOSE_FLOW_HOOKS, type CloseFlowHooks } from './close-flow.service';
import { CloseFlowNotify } from './notify.service';
import { CloseFlowStore, TypeOrmCloseFlowStore } from './store';
import { NurtureSequence } from './nurture-sequence.entity';
import { SETTLE_SITE } from './site.config';
import { CLOSE_FLOW_SITE } from './close-flow.types';
import { Lead } from '../entities/lead.entity';
import type Stripe from 'stripe';
import type { NurtureRow } from './close-flow.types';

/**
 * Settle onPaid hook — a paid 'match_fee' checkout stamps the consumer lead
 * (matchFeePaidAt), which is what unlocks direct provider contact on the
 * compare page.
 */
@Injectable()
class SettleCloseHooks implements CloseFlowHooks {
  private readonly logger = new Logger('SettleCloseHooks');

  constructor(@InjectRepository(Lead) private readonly leads: Repository<Lead>) {}

  async onPaid(row: NurtureRow, session: Stripe.Checkout.Session) {
    if (row.offer !== 'match_fee' || !row.leadRef) return;
    await this.leads.update(row.leadRef, {
      matchFeePaidAt: new Date(),
      matchFeeSessionId: session.id,
    });
    this.logger.log(`lead ${row.leadRef} → match fee paid (${session.amount_total ?? '?'}¢)`);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([NurtureSequence, Lead])],
  controllers: [CloseFlowController],
  providers: [
    { provide: CloseFlowStore, useClass: TypeOrmCloseFlowStore },
    { provide: CLOSE_FLOW_SITE, useValue: SETTLE_SITE },
    { provide: CLOSE_FLOW_HOOKS, useClass: SettleCloseHooks },
    CloseFlowNotify,
    CloseFlowService,
  ],
  exports: [CloseFlowService],
})
export class CloseFlowModule implements OnModuleInit {
  onModuleInit() {
    CloseFlowService.registerSite(SETTLE_SITE);
  }
}
