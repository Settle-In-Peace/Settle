import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../entities/lead.entity';
import { Provider } from '../entities/provider.entity';
import { Match } from '../entities/match.entity';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { LeadScoringService } from './lead-scoring.service';
import { LlmClientService } from './llm-client.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, Match, Provider])],
  providers: [AiService, LeadScoringService, LlmClientService],
  controllers: [AiController],
  exports: [AiService, LeadScoringService, LlmClientService],
})
export class AiModule {}
