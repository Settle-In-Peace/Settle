import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';
import { OptionalJwtAuthGuard } from '../feedback/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  /** Public: published + answered questions, optional ?category= filter. */
  @Get()
  list(@Query('category') category?: string) {
    return this.questionsService.list(category);
  }

  /**
   * Public: ask a question — NO account required. Anonymity is the feature;
   * optional contactEmail is stored internally but never displayed.
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  create(@Body() dto: CreateQuestionDto, @Request() req: any) {
    return this.questionsService.create(dto, req.user);
  }

  /** Public: question detail + answers (hidden questions 404). */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.questionsService.getPublic(id);
  }

  /**
   * Any logged-in user may answer; anonymous answers are email-gated
   * (contactEmail required when unauthenticated — never displayed).
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/answers')
  addAnswer(
    @Param('id') id: string,
    @Body() dto: CreateAnswerDto,
    @Request() req: any,
  ) {
    return this.questionsService.addAnswer(id, dto, req.user);
  }

  /** Admin: publish / hide / mark a question answered. */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionsService.update(id, dto);
  }

  /** Admin: mark an answer official (or unflag it). */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':questionId/answers/:answerId')
  updateAnswer(
    @Param('questionId') questionId: string,
    @Param('answerId') answerId: string,
    @Body() dto: UpdateAnswerDto,
  ) {
    return this.questionsService.updateAnswer(questionId, answerId, dto);
  }
}
