import { IsString, IsOptional, Length } from 'class-validator';

/**
 * JSON body for CSV import (the file content rides in `csv`).
 * All fields optional so the global ValidationPipe doesn't reject raw
 * text/csv uploads — the controller validates vendor/csv itself for both
 * content types.
 */
export class ImportCsvDto {
  @IsString()
  @IsOptional()
  @Length(1, 100)
  vendor?: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  filename?: string;

  /** Raw CSV file contents (JSON path only). */
  @IsString()
  @IsOptional()
  csv?: string;
}
