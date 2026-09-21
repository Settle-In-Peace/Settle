import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePortalPaymentPlanDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  totalAmount: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  downPayment?: number;

  @IsInt()
  @Min(1)
  numberOfPayments: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  paymentAmount: number;

  @IsString()
  @IsOptional()
  frequency?: string;

  @IsDateString()
  startDate: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  stripePaymentMethodId?: string;

  @IsBoolean()
  @IsOptional()
  autoPay?: boolean;
}
