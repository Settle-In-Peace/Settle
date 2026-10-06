import { IsBoolean, IsOptional } from 'class-validator';

/** Admin: flag/unflag an answer as an official Settle-team response. */
export class UpdateAnswerDto {
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean;
}
