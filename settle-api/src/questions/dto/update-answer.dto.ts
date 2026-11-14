import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { QaAnswerStatus } from '../qa-answer.entity';

/** Admin: flag/unflag an answer as an official Settle-team response. */
export class UpdateAnswerDto {
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;

  /** Admin moderation: approve ('published') or reject ('hidden') an answer. */
  @IsOptional()
  @IsIn([QaAnswerStatus.PUBLISHED, QaAnswerStatus.HIDDEN])
  status?: QaAnswerStatus;
}
