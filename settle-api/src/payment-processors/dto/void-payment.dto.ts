import { IsUUID } from 'class-validator';

export class VoidPaymentDto {
  /** Internal processor_payments row id of the original sale. */
  @IsUUID()
  paymentId: string;
}
