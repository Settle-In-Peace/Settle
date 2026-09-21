import { IsOptional, IsString } from 'class-validator';

export class FailPaymentDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
