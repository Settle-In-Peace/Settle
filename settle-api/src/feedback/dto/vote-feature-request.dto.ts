import { IsString, IsOptional, MaxLength } from 'class-validator';

export class VoteFeatureRequestDto {
  /**
   * Client-generated voter id (localStorage `settle_voter_id`). Ignored when
   * the caller is authenticated — their user id is used instead.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  voterId?: string;
}
