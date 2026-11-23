import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachingService } from './coaching.service';
import { CoachingController } from './coaching.controller';
import { CoachingChatController } from './coaching-chat.controller';
import { CoachingChatService } from './coaching-chat.service';
import { CoachingEntitlementGuard } from './coaching-entitlement.guard';
import { LlmClientService } from '../ai/llm-client.service';
import { Budget } from '../entities/budget.entity';
import { BudgetItem } from '../entities/budget-item.entity';
import { Goal } from '../entities/goal.entity';
import { CoachingSubscription } from '../entities/coaching-subscription.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Budget, BudgetItem, Goal, CoachingSubscription, User])],
  controllers: [CoachingController, CoachingChatController],
  providers: [
    CoachingService,
    CoachingChatService,
    CoachingEntitlementGuard,
    LlmClientService,
  ],
  exports: [CoachingService],
})
export class CoachingModule {}
