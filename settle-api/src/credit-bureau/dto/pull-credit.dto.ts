import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import {
  CreditPullType,
  CreditReportProduct,
} from '../credit-provider.interface';

export class CreditConsentDto {
  @IsDateString()
  grantedAt: string;

  @IsEnum(['web_form', 'phone', 'paper', 'imported'])
  method: 'web_form' | 'phone' | 'paper' | 'imported';

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  consentLanguage?: string;
}

export class PullCreditDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @Matches(/^\d{3}-?\d{2}-?\d{4}$/, {
    message: 'SSN must be in XXX-XX-XXXX format',
  })
  ssn?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  streetAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @Matches(/^\d{5}(-?\d{4})?$/, { message: 'Invalid ZIP code' })
  zip?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(CreditPullType)
  pullType: CreditPullType;

  @IsEnum(CreditReportProduct)
  product: CreditReportProduct;

  @IsString()
  permissiblePurpose: string;

  @IsObject()
  consent: CreditConsentDto;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsUUID()
  collectionAccountId?: string;
}
