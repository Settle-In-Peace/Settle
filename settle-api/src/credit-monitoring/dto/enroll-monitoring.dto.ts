import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * POST /credit-monitoring/enroll
 * The consent record is the FCRA evidence for all future pulls — every field
 * that can be captured server-side (IP, user agent) is back-filled by the
 * controller from the request if the client omits it.
 */
export class EnrollMonitoringDto {
  /** Member email enrolled at the provider — defaults to the account email. */
  @IsOptional()
  @IsEmail()
  memberEmail?: string;

  /** When the consumer granted consent (defaults to now server-side). */
  @IsOptional()
  @IsDateString()
  grantedAt?: string;

  /** How consent was captured — the enroll checkbox submits 'web_form'. */
  @IsIn(['web_form', 'phone', 'paper', 'imported'])
  method: 'web_form' | 'phone' | 'paper' | 'imported';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  /** The consent language the consumer agreed to (kept verbatim as evidence). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  consentLanguage?: string;
}
