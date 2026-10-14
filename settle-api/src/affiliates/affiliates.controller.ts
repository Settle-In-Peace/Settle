import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AffiliatesService } from './affiliates.service';
import { AffiliateConversionStatus } from './affiliate-conversion.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * Admin read/reconcile surface for inbound affiliate conversions.
 * All routes require a staff/admin JWT.
 */
@Controller('affiliates')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AffiliatesController {
  constructor(private readonly affiliatesService: AffiliatesService) {}

  /** GET /affiliates/conversions?network=&status=&limit= */
  @Get('conversions')
  list(
    @Query('network') network?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.affiliatesService.list({
      network,
      status,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  /** GET /affiliates/conversions/summary — payout totals by network+status. */
  @Get('conversions/summary')
  summary() {
    return this.affiliatesService.summary();
  }

  /** PATCH /affiliates/conversions/:id — { status: pending|approved|rejected|paid } */
  @Patch('conversions/:id')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    const status = body?.status as AffiliateConversionStatus;
    if (
      !Object.values(AffiliateConversionStatus).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${Object.values(AffiliateConversionStatus).join(', ')}`,
      );
    }
    return this.affiliatesService.updateStatus(id, status);
  }
}
