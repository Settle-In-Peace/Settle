import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { QaCategory } from '../qa-question.entity';

export class CreateQuestionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsIn(Object.values(QaCategory))
  category?: QaCategory;

  /**
   * Optional contact for follow-up — stored internally, NEVER displayed or
   * returned by public endpoints.
   */
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
