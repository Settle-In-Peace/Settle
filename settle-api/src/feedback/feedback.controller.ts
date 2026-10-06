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
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service';
import { CreateFeatureRequestDto } from './dto/create-feature-request.dto';
import { VoteFeatureRequestDto } from './dto/vote-feature-request.dto';
import { UpdateFeatureRequestDto } from './dto/update-feature-request.dto';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  /** Public: list feature requests, optionally filtered by ?status=. */
  @Get()
  list(@Query('status') status?: string) {
    return this.feedbackService.list(status);
  }

  /**
   * Public-ish: anyone can submit. If a JWT is present the request is linked
   * to the user; otherwise an email is required for follow-up.
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  create(@Body() dto: CreateFeatureRequestDto, @Request() req: any) {
    return this.feedbackService.create(dto, req.user);
  }

  /**
   * Toggle a vote. Voter identity is the authenticated user id when present,
   * else a client-generated voterId from the body.
   */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Body() dto: VoteFeatureRequestDto,
    @Request() req: any,
  ) {
    const voterId = req.user?.sub ?? req.user?.id ?? dto.voterId;
    if (!voterId) {
      throw new BadRequestException('voterId is required.');
    }
    return this.feedbackService.toggleVote(id, voterId);
  }

  /** Admin: change status (planned/in_progress/shipped/declined) or edit. */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeatureRequestDto) {
    return this.feedbackService.update(id, dto);
  }
}
