import { IsString, IsOptional, Length } from 'class-validator';

/** JSON body for CSV import (the file content rides in `csv`). */
export class ImportCsvDto {
  @IsString()
  @Length(1, 100)
  vendor!: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  filename?: string;

  /** Raw CSV file contents. */
  @IsString()
  csv!: string;
}
