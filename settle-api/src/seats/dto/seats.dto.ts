import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrgRole } from '../org-member.entity';
import { SeatStatus, SeatTier } from '../seat.entity';
import { OrgStatus } from '../org.entity';

export class CreateOrgDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  /** BYOK skip-trace vendor key — empty string clears back to platform metering. */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  skiptraceKey?: string;

  /** Platform admin only — provision the org for another user. Ignored otherwise. */
  @IsUUID()
  @IsOptional()
  ownerUserId?: string;
}

export class UpdateOrgDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  /** BYOK skip-trace vendor key — empty string clears back to platform metering. */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  skiptraceKey?: string;

  @IsEnum(OrgStatus)
  @IsOptional()
  status?: OrgStatus;

  @IsInt()
  @Min(0)
  @IsOptional()
  seatsPurchased?: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  planCode?: string;
}

export class InviteMemberDto {
  /** Either a user id or an email of an existing user. */
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(OrgRole)
  @IsOptional()
  orgRole?: OrgRole;
}

export class UpdateMemberDto {
  @IsEnum(OrgRole)
  @IsOptional()
  orgRole?: OrgRole;

  @IsIn(['active', 'invited', 'suspended'])
  @IsOptional()
  status?: string;
}

export class AssignSeatDto {
  @IsUUID()
  userId!: string;

  @IsEnum(SeatTier)
  @IsOptional()
  seatTier?: SeatTier;
}

export class UpdateSeatDto {
  @IsEnum(SeatTier)
  @IsOptional()
  seatTier?: SeatTier;

  @IsIn([SeatStatus.ACTIVE, SeatStatus.SUSPENDED])
  @IsOptional()
  status?: SeatStatus;
}

export class SeatCheckoutDto {
  /** seat_plans.code — starter | pro | enterprise */
  @IsString()
  @MaxLength(50)
  planCode!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  seats!: number;

  /** Optional absolute return URL; defaults to FRONTEND_URL + /dashboard/org. */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  returnUrl?: string;
}

export class DispositionDto {
  @IsString()
  @MaxLength(50)
  disposition!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
