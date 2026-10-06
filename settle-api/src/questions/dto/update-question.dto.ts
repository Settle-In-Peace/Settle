import { IsOptional, IsIn } from 'class-validator';
import { QaQuestionStatus } from '../qa-question.entity';

/** Admin: publish / hide / mark answered. */
export class UpdateQuestionDto {
  @IsOptional()
  @IsIn(Object.values(QaQuestionStatus))
  status?: QaQuestionStatus;
}
