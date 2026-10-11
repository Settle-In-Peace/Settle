import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
} from 'class-validator';

/** Enrollment product — selects the MFSN path segment. */
export const MFSN_ENROLLMENT_PRODUCTS = ['member', 'credit', 'funding'] as const;
export type MfsnEnrollmentProduct = (typeof MFSN_ENROLLMENT_PRODUCTS)[number];

/**
 * POST /credit-bureau/enrollment/start
 * Step 1 of the MFSN enrollment lifecycle — DIT identity verification.
 */
export class StartEnrollmentDto {
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  lastName: string;

  @IsString()
  addressLine1: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  city: string;

  @Matches(/^[A-Z]{2}$/, { message: 'region must be a 2-letter state code' })
  region: string;

  @Matches(/^\d{5}(-?\d{4})?$/, { message: 'Invalid ZIP/postal code' })
  postalCode: string;

  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: 'dob must be MM/DD/YYYY',
  })
  dob: string;

  @Matches(/^\d{9}$/, { message: 'ssn must be 9 digits, no dashes' })
  ssn: string;

  @Matches(/^[1-9]\d{9}$/, {
    message: 'number must be a 10-digit mobile, no formatting',
  })
  number: string;

  @IsEmail()
  email: string;

  @IsUrl({ require_protocol: true }, { message: 'consentURL must be a valid URL' })
  consentURL: string;

  @IsString()
  planId: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsIn(MFSN_ENROLLMENT_PRODUCTS)
  product?: MfsnEnrollmentProduct;
}

/**
 * POST /credit-bureau/enrollment/send-link
 * Step 2 — sends the SMFA verification link to the applicant.
 */
export class SendEnrollmentLinkDto {
  @IsString()
  correlationId: string;

  @IsString()
  subjectIdentifier: string;

  @IsOptional()
  @IsIn(['Email', 'Sms'])
  subjectType?: 'Email' | 'Sms';

  @IsUrl({ require_protocol: true })
  redirectUrl: string;

  @IsOptional()
  @IsIn(MFSN_ENROLLMENT_PRODUCTS)
  product?: MfsnEnrollmentProduct;
}

/**
 * Shared body for validate-link and complete steps — correlationId only.
 */
export class EnrollmentStepDto {
  @IsString()
  correlationId: string;

  @IsOptional()
  @IsIn(MFSN_ENROLLMENT_PRODUCTS)
  product?: MfsnEnrollmentProduct;
}
