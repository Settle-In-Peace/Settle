import { OrgPhoneNumber } from '../entities/org-phone-number.entity';
import { NumbersController } from './numbers.controller';
import { NumbersService } from './numbers.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Org } from './org.entity';
import { OrgMember } from './org-member.entity';
import { Seat } from './seat.entity';
import { SeatUsage } from './seat-usage.entity';
import { SeatPlan } from './seat-plan.entity';
import { User } from '../entities/user.entity';
import { DialerCall } from '../dialer/dialer-call.entity';
import { CollectionAccount } from '../entities/collection-account.entity';
import { CrmClient } from '../entities/crm-client.entity';
import { CrmLead } from '../entities/crm-lead.entity';
import { DebtorProfile } from '../entities/debtor-profile.entity';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog } from '../entities/consent-log.entity';
import { StripeModule } from '../stripe/stripe.module';
import { OrgRoleGuard } from './org-role.guard';
import { SeatsService } from './seats.service';
import { AgentQueueService } from './agent-queue.service';
import { SeatsController } from './seats.controller';
import { OrgsController } from './orgs.controller';
import { AgentDialerController } from './agent-dialer.controller';

/**
 * SeatsModule — per-seat DaaS (Dialer-as-a-Software) tenancy.
 *
 * Settle is the software vendor; each `org` row is a customer (collection
 * agency / law firm) that remains the FDCPA-licensed collector of record.
 * `orgs` is the tenant; existing `group_id` fields on the crm_/dnc/consent
 * entities map to org.id for tenant scoping.
 *
 * Surfaces:
 *   /seats*          — org seat roster + usage rollup (OrgRoleGuard)
 *   /orgs*           — self-serve org admin + platform-admin CRUD
 *   /dialer/queue    — agent work queue w/ pre-dial compliance snapshot
 *   /dialer/my-stats · /dialer/team-stats · /dialer/calls/:id/disposition
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Org,
      OrgMember,
      Seat,
      SeatUsage,
      SeatPlan,
      User,
      DialerCall,
      CollectionAccount,
      CrmClient,
      CrmLead,
      DebtorProfile,
      DncEntry,
      ConsentLog,
      OrgPhoneNumber,
    ]),
    StripeModule,
  ],
  controllers: [SeatsController, OrgsController, AgentDialerController, NumbersController],
  providers: [SeatsService, AgentQueueService, OrgRoleGuard, NumbersService],
  exports: [SeatsService],
})
export class SeatsModule {}
