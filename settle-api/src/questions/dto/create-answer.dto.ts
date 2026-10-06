import {
  IsString,
  IsOptional,
  IsEmail,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  /**
   * Email-gated anonymous answers: required when the caller is not
   * authenticated. Stored internally, never displayed.
   */
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}
