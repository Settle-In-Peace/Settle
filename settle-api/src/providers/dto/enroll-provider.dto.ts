import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Lightweight provider enrollment — no password. Creates a providers row
 * with status 'pending_review'. On admin approval the provider gets an
 * emailed one-time link to set a password and activate portal access.
 */
export class EnrollProviderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  contactName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Services offered (e.g. debt_settlement, debt_consolidation, credit_repair). */
  @IsArray()
  @IsString({ each: true })
  serviceTypes!: string[];

  /** Debt types handled (e.g. credit_card, medical, personal_loan). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  debtTypes?: string[];

  /** States served — empty array means nationwide. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  statesServed?: string[];

  /** Free-text description of the provider's fee model. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feeStructure?: string;

  /** Access plan selected on the /providers page (pay_per_lead, marketplace_seat, enterprise). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  planInterest?: string;

  @IsOptional()
  @IsNumber()
  minDebtAmount?: number;

  @IsOptional()
  @IsNumber()
  maxDebtAmount?: number;

  @IsOptional()
  @IsNumber()
  feePercentage?: number;

  @IsOptional()
  @IsNumber()
  yearsInBusiness?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  bbbRating?: string;

  @IsOptional()
  @IsBoolean()
  isAfccMember?: boolean;

  @IsOptional()
  @IsBoolean()
  isIapdaMember?: boolean;
}
