import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QaQuestion } from './qa-question.entity';
import { QaAnswer } from './qa-answer.entity';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

/**
 * QuestionsModule — anonymous probate/estate Q&A board.
 *
 * Routes:
 *   GET   /questions                              — public list (?category=)
 *   POST  /questions                              — anonymous ask (no auth)
 *   GET   /questions/:id                          — public detail + answers
 *   POST  /questions/:id/answers                  — logged-in or email-gated anonymous
 *   PATCH /questions/:id                          — admin publish/hide/answered
 *   PATCH /questions/:questionId/answers/:answerId — admin flag official
 *
 * Privacy contract: author_user_id / contact_email are stored internally and
 * NEVER returned by public endpoints.
 */
@Module({
  imports: [TypeOrmModule.forFeature([QaQuestion, QaAnswer])],
  controllers: [QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
