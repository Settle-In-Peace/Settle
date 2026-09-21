import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdatePaymentPlanDto {
  @IsString()
  @IsOptional()
  status?: string; // pending, active, completed, defaulted, cancelled, paused

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

  @IsString()
  @IsOptional()
  frequency?: string;

  @IsOptional()
  customFields?: Record<string, any>;
}
