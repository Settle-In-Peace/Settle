import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class BatchSkipTraceDto {
  /** Lookups to run this call — capped at 500 per batch per run. */
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  maxLookups?: number;
}
