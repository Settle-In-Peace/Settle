import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Charge request. NOTE: there is intentionally NO card number, expiry, or
 * CVV field — PAN/CVV never reaches this API. `paymentToken` is a
 * single-use processor token (NMI Collect.js payment_token, AuthNet
 * Accept.js opaqueData, Stripe pm_…); `vaultId` is a stored card-on-file.
 */
export class ChargePaymentDto {
  @IsUUID()
  collectionAccountId: string;

  @IsOptional()
  @IsUUID()
  debtorId?: string;

  @IsOptional()
  @IsUUID()
  debtId?: string;

  @IsOptional()
  @IsUUID()
  paymentPlanId?: string;

  @IsInt()
  @Min(1)
  amountCents: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  convenienceFeeCents?: number;

  @IsOptional()
  @IsIn(['usd'])
  currency?: string;

  /** Single-use processor token (Collect.js / Accept.js / pm_…). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paymentToken?: string;

  /** Saved customer-vault / payment-method id for card-on-file. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  vaultId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  /** Pin the charge to a specific processor; default = priority order. */
  @IsOptional()
  @IsIn(['nmi', 'authorizenet', 'stripe'])
  processor?: 'nmi' | 'authorizenet' | 'stripe';

  // ── FDCPA / state convenience-fee compliance ──────────────────────────
  /**
   * Required: the debtor was shown and acknowledged the applicable
   * disclosure (convenience-fee legality differs by state). Stored with a
   * server-side timestamp — the charge is refused without it.
   */
  @IsBoolean()
  disclosureAcknowledged: boolean;

  /** Exact disclosure text shown — stored verbatim for audit. */
  @IsOptional()
  @IsString()
  disclosureText?: string;

  /** Client-generated idempotency key — duplicate POSTs return the original record. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
