import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * One message in the SI coach conversation. `system` is deliberately not
 * accepted — clients may never inject system prompts.
 */
export class CoachingChatMessageDto {
  @IsEnum(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class CoachingChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CoachingChatMessageDto)
  messages!: CoachingChatMessageDto[];
}
