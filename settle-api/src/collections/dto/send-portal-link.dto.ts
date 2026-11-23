import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Staff-triggered delivery of the debtor payment-portal link.
 * At least one channel must be true — this is always a manual,
 * per-account staff action (never bulk/automatic).
 */
export class SendPortalLinkDto {
  /** Email the link to the debtor's email address on file. */
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  /** Text the link to the debtor's phone on file (normalized to E.164). */
  @IsBoolean()
  @IsOptional()
  sms?: boolean;
}
