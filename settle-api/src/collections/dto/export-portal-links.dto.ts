import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ExportPortalLinksDto {
  /** Collection account ids to include in the CSV batch (max 200). */
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  accountIds: string[];

  /**
   * Optional free-text audit note recorded on each exported account
   * (who exported is always recorded via the staff user's id).
   */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
