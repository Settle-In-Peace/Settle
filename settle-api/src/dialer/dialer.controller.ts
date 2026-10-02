import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesGuard } from '../auth/guards/sales.guard';
import { DialerService } from './dialer.service';
import { PlaceCallDto } from './dto/place-call.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

/**
 * Dialer REST API — JWT + sales/admin guarded, same as collections.
 * Webhooks live on DialerWebhookController (signature-verified, no JWT).
 */
@Controller('dialer')
@UseGuards(JwtAuthGuard, SalesGuard)
export class DialerController {
  constructor(private readonly dialerService: DialerService) {}

  /**
   * POST /dialer/call — originate an outbound call.
   * Rate-limited harder than the global 30/min throttle: outbound dialing is
   * a TCPA-sensitive operation — 10 calls/min per caller.
   */
  @Post('call')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  placeCall(@Body() dto: PlaceCallDto, @Req() req: AuthenticatedRequest) {
    return this.dialerService.placeCall(dto, req.user.sub);
  }

  /** GET /dialer/calls?contactId=&debtId=&collectionAccountId= */
  @Get('calls')
  listCalls(
    @Query('contactId') contactId?: string,
    @Query('debtId') debtId?: string,
    @Query('collectionAccountId') collectionAccountId?: string,
    @Query('agentId') agentId?: string,
  ) {
    return this.dialerService.listCalls({
      contactId,
      debtId,
      collectionAccountId,
      agentId,
    });
  }

  /** GET /dialer/calls/:id */
  @Get('calls/:id')
  getCall(@Param('id') id: string) {
    return this.dialerService.getCall(id);
  }

  /** POST /dialer/calls/:id/hangup */
  @Post('calls/:id/hangup')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  hangup(@Param('id') id: string) {
    return this.dialerService.hangup(id);
  }

  /** GET /dialer/status — which provider is active/configured (no upstream call). */
  @Get('status')
  getStatus() {
    return this.dialerService.getStatus();
  }
}
