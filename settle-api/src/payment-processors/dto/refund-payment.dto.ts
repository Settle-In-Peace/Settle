import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class RefundPaymentDto {
  /** Internal processor_payments row id of the original sale. */
  @IsUUID()
  paymentId: string;

  /** Omit for a full refund of the original amount. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
