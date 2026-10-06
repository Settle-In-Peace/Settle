import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureRequest } from './feature-request.entity';
import { FeatureRequestVote } from './feature-request-vote.entity';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

/**
 * FeedbackModule — public feature-request board.
 *
 * Routes:
 *   GET   /feedback           — public list (?status=)
 *   POST  /feedback           — anonymous or authenticated submit
 *   POST  /feedback/:id/vote  — toggle vote by user id or client voterId
 *   PATCH /feedback/:id       — admin-only status/edit
 */
@Module({
  imports: [TypeOrmModule.forFeature([FeatureRequest, FeatureRequestVote])],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
