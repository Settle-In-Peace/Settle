import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PlaceCallDto } from './place-call.dto';

/**
 * AI voice-call request — same fields as a manual dial, plus the lead
 * linkage used by the SI outbound caller. `manualDial` is ignored: AI
 * calls are always automated (autodial semantics), so stored consent or an
 * agent attestation is mandatory — enforced in DialerService.assertDialable
 * and re-verified inside settle-voice before origination.
 */
export class PlaceVoiceCallDto extends PlaceCallDto {
  /** Lead record the call is about (leads.id) — for transcript context. */
  @IsUUID()
  @IsOptional()
  leadId?: string;

  /** Display name for the lead — used in the AI opening line. */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  leadName?: string;
}
