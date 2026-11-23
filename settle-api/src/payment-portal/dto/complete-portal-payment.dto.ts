import { IsString } from 'class-validator';

export class CompletePortalPaymentDto {
  @IsString()
  paymentIntentId: string;
}
