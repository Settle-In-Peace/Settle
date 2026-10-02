import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  Length,
} from 'class-validator';

export class PurchaseLeadsDto {
  /** Vendor machine name (e.g. 'boberdoo'). */
  @IsString()
  @Length(1, 100)
  vendor!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  quantity!: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  states?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  debtTypes?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  minDebt?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDebt?: number;

  /** Price ceiling — a ping/order above this is rejected before posting. */
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxPricePerLead?: number;
}
