import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentPlanDto {
  @IsUUID()
  collectionAccountId: string;

  @IsUUID()
  @IsOptional()
  crmClientId?: string;

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
  frequency?: string; // weekly, biweekly, monthly

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

  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  customFields?: Record<string, any>;
}
