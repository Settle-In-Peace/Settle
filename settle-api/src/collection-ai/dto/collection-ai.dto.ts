import {
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class DraftOfferDto {
  @IsUUID()
  accountId!: string;

  /** Target settlement percentage of current balance (1-100). Default 60. */
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  targetPercent?: number;

  /** Optional installment term in months for the offer. */
  @IsInt()
  @Min(1)
  @Max(60)
  @IsOptional()
  termMonths?: number;

  /** Optional extra context for the drafter (e.g. "debtor offered 40%"). */
  @IsString()
  @IsOptional()
  notes?: string;
}

export class NextActionDto {
  @IsUUID()
  accountId!: string;
}

export class SummarizeDto {
  @IsUUID()
  @IsOptional()
  accountId?: string;

  /** Freeform notes/log text to summarize (alternative to accountId). */
  @IsString()
  @IsOptional()
  text?: string;
}

export class ComplianceCheckDto {
  @IsString()
  text!: string;

  /** What the text is for — biases which rules matter. */
  @IsIn(['call_script', 'sms', 'email', 'letter', 'note'])
  @IsOptional()
  channel?: 'call_script' | 'sms' | 'email' | 'letter' | 'note';
}
