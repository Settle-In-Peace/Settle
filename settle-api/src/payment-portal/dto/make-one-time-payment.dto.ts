import { IsNumber, IsString } from 'class-validator';

export class MakeOneTimePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @IsString()
  stripePaymentMethodId: string;
}
