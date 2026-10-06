import {
  IsString,
  IsOptional,
  IsEmail,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateFeatureRequestDto {
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  /** Display name for anonymous submissions. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;

  /**
   * Required when the request is submitted anonymously (no JWT). Stored for
   * follow-up; never returned by public endpoints.
   */
  @IsOptional()
  @IsEmail()
  email?: string;
}
