import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditMonitoringService } from './credit-monitoring.service';
import { EnrollMonitoringDto } from './dto/enroll-monitoring.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

/**
 * Consumer credit-monitoring endpoints — member-facing, JWT only (no
 * SalesGuard/MfaGuard; this is the consumer's own data).
 */
@Controller('credit-monitoring')
@UseGuards(JwtAuthGuard)
export class CreditMonitoringController {
  constructor(
    private readonly creditMonitoring: CreditMonitoringService,
  ) {}

  /** Enroll for monitoring — records the FCRA consent evidence. */
  @Post('enroll')
  enroll(@Body() dto: EnrollMonitoringDto, @Req() req: AuthenticatedRequest) {
    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
      req.ip;
    return this.creditMonitoring.enrollForMonitoring(req.user.sub, dto, {
      ipAddress,
      userAgent: req.headers['user-agent'],
    });
  }

  /** Enrollment + latest snapshot summary + unread alert count. */
  @Get('status')
  status(@Req() req: AuthenticatedRequest) {
    return this.creditMonitoring.getStatus(req.user.sub);
  }

  /** Snapshot history (newest first; raw provider payload is never returned). */
  @Get('snapshots')
  snapshots(@Req() req: AuthenticatedRequest) {
    return this.creditMonitoring.listSnapshots(req.user.sub);
  }

  /** Alert feed — `?unread=1` filters to unread only. */
  @Get('alerts')
  alerts(
    @Req() req: AuthenticatedRequest,
    @Query('unread') unread?: string,
  ) {
    return this.creditMonitoring.listAlerts(
      req.user.sub,
      unread === '1' || unread === 'true',
    );
  }

  /** Mark one alert read (ownership-verified). */
  @Post('alerts/:id/read')
  markAlertRead(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.creditMonitoring.markAlertRead(req.user.sub, id);
  }

  /** Manual pull — rate-limited to once/day per enrollment (429 beyond that). */
  @Post('refresh')
  refresh(@Req() req: AuthenticatedRequest) {
    return this.creditMonitoring.manualRefresh(req.user.sub);
  }
}
