import { IsEmail, IsIn } from 'class-validator';

/**
 * POST /credit-bureau/enrollment/report
 * Fetch a credit report for an ALREADY-ENROLLED member (keyed by member email).
 */
export class MemberReportDto {
  @IsEmail()
  email: string;

  @IsIn(['credit', 'funding', '3b'])
  product: 'credit' | 'funding' | '3b';
}
