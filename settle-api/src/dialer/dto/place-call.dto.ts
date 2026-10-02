import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class PlaceCallDto {
  /** Destination number — any common US format; normalized to E.164 server-side. */
  @IsString()
  @MaxLength(30)
  to!: string;

  /** Caller ID override (defaults to provider from-number). */
  @IsString()
  @IsOptional()
  @MaxLength(30)
  from?: string;

  @IsUUID()
  @IsOptional()
  contactId?: string;

  @IsUUID()
  @IsOptional()
  debtId?: string;

  @IsUUID()
  @IsOptional()
  collectionAccountId?: string;

  /**
   * TCPA: agent attests that consent to call is on file. Required (or backed
   * by a stored consent record) when manualDial=false.
   */
  @IsBoolean()
  @IsOptional()
  consentConfirmed?: boolean;

  /**
   * TCPA: true = human-initiated click-to-call (default); false = autodial /
   * preview-dial semantics — requires confirmed consent.
   */
  @IsBoolean()
  @IsOptional()
  manualDial?: boolean;

  /** ViciDial: agent extension that owns the origination (agent_user). */
  @IsString()
  @IsOptional()
  @MaxLength(50)
  agentExtension?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
