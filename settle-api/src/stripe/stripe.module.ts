import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from '../entities/provider.entity';
import { Lead } from '../entities/lead.entity';
import { User } from '../entities/user.entity';
import { CoachingSubscription } from '../entities/coaching-subscription.entity';
import { Org } from '../seats/org.entity';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { ProvidersModule } from '../providers/providers.module';
import { EmailModule } from '../email/email.module';
import { CloseFlowModule } from '../close-flow/close-flow.module';

@Module({
  imports: [TypeOrmModule.forFeature([Provider, Lead, User, CoachingSubscription, Org]), ProvidersModule, EmailModule, CloseFlowModule],
  controllers: [StripeController],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
