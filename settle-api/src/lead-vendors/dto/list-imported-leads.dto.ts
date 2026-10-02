import { IsString, IsOptional, IsUUID, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ListImportedLeadsDto {
  @IsString()
  @IsOptional()
  vendor?: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  minScore?: number;

  /** new | available | sold | converted | rejected | expired | duplicate */
  @IsString()
  @IsOptional()
  status?: string;

  /** Import disposition: live rows only vs everything incl. duplicates. */
  @IsIn(['all', 'imported', 'duplicates'])
  @IsOptional()
  disposition?: 'all' | 'imported' | 'duplicates';

  @IsString()
  @IsOptional()
  search?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  @IsOptional()
  limit?: number;
}
