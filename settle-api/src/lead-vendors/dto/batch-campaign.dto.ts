import { IsBoolean } from 'class-validator';

export class BatchCampaignDto {
  /**
   * Agent attestation that every queued contact has TCPA consent — the same
   * gate the dialer enforces per call (plus stored consent records).
   */
  @IsBoolean()
  consentConfirmed!: boolean;
}
