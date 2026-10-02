import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  Length,
  Min,
} from 'class-validator';
import { LeadVendorType } from '../../entities/lead-vendor-account.entity';

export class UpsertVendorAccountDto {
  @IsString()
  @Length(1, 100)
  vendorName!: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  displayName?: string;

  @IsEnum(LeadVendorType)
  @IsOptional()
  vendorType?: LeadVendorType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Name of the env var holding the API key — never the key itself. */
  @IsString()
  @IsOptional()
  @Length(0, 200)
  apiKeyRef?: string;

  /** Name of the env var holding the webhook HMAC secret. */
  @IsString()
  @IsOptional()
  @Length(0, 200)
  webhookSecretRef?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  defaultPrice?: number;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;
}
