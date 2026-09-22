import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesGuard } from '../auth/guards/sales.guard';
import { CreditBureauService } from './credit-bureau.service';
import { PullCreditDto } from './dto/pull-credit.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

@Controller('credit-bureau')
@UseGuards(JwtAuthGuard, SalesGuard)
export class CreditBureauController {
  constructor(private readonly creditBureauService: CreditBureauService) {}

  /** Pull a credit report from MyFreeScoreNow */
  @Post('pull')
  pullCredit(
    @Body() dto: PullCreditDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.creditBureauService.pullCredit(dto, req.user.sub);
  }

  /** Get all credit reports for a collection account */
  @Get('accounts/:accountId/reports')
  getReports(@Param('accountId') accountId: string) {
    return this.creditBureauService.getReports(accountId);
  }

  /** Get a single credit report (raw response stripped) */
  @Get('reports/:id')
  getReport(@Param('id') id: string) {
    return this.creditBureauService.getReport(id);
  }

  /** Health check — verify provider credentials are valid */
  @Get('health')
  healthCheck() {
    return this.creditBureauService.healthCheck();
  }
}
