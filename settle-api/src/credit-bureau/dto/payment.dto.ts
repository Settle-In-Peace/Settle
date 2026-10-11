import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  MFSN_ENROLLMENT_PRODUCTS,
  MfsnEnrollmentProduct,
} from './start-enrollment.dto';

/**
 * POST /credit-bureau/enrollment/payment
 * Step 5 — attaches a card and bills the first period. A paid member counts
 * as an "Active" for affiliate commissions.
 */
export class EnrollmentPaymentDto {
  @IsString()
  correlationId: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @Matches(/^\d{13,19}$/, { message: 'cardNumber must be digits only' })
  cardNumber: string;

  @Matches(/^\d{3,4}$/, { message: 'cvv must be 3-4 digits' })
  cvv: string;

  @Matches(/^\d{5}(-?\d{4})?$/, { message: 'Invalid billing ZIP' })
  billingZip: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expiryMonth: number;

  @IsInt()
  @Min(2024)
  expiryYear: number;

  @IsIn(['monthly', 'yearly'])
  term: 'monthly' | 'yearly';

  @IsOptional()
  @IsString()
  installment?: string;

  @IsOptional()
  @IsIn(MFSN_ENROLLMENT_PRODUCTS)
  product?: MfsnEnrollmentProduct;
}
