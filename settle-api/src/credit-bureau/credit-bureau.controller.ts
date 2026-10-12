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
import {
  EnrollmentStepDto,
  SendEnrollmentLinkDto,
  StartEnrollmentDto,
} from './dto/start-enrollment.dto';
import { EnrollmentPaymentDto } from './dto/payment.dto';
import { MemberReportDto } from './dto/member-report.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

@Controller('credit-bureau')
@UseGuards(JwtAuthGuard, SalesGuard)
export class CreditBureauController {
  constructor(private readonly creditBureauService: CreditBureauService) {}

  // ── Enrollment lifecycle (MyFreeScoreNow member/credit/funding) ─────────

  /** Step 1 — DIT identity verification -> { correlationId, decision } */
  @Post('enrollment/start')
  startEnrollment(@Body() dto: StartEnrollmentDto) {
    return this.creditBureauService.startEnrollment(dto);
  }

  /** Step 2 — send the applicant's SMFA verification link */
  @Post('enrollment/send-link')
  sendEnrollmentLink(@Body() dto: SendEnrollmentLinkDto) {
    return this.creditBureauService.sendEnrollmentLink(dto);
  }

  /** Step 3 — confirm the applicant consumed the link */
  @Post('enrollment/validate-link')
  validateEnrollmentLink(@Body() dto: EnrollmentStepDto) {
    return this.creditBureauService.validateEnrollmentLink(
      dto.correlationId,
      dto.product,
    );
  }

  /** Step 4 — complete enrollment (creates the member account) */
  @Post('enrollment/complete')
  completeEnrollment(@Body() dto: EnrollmentStepDto) {
    return this.creditBureauService.completeEnrollment(
      dto.correlationId,
      dto.product,
    );
  }

  /** Step 5 — card payment -> member becomes Active (commission-earning) */
  @Post('enrollment/payment')
  submitEnrollmentPayment(@Body() dto: EnrollmentPaymentDto) {
    return this.creditBureauService.submitEnrollmentPayment(dto);
  }

  /** Available subscription plans on this affiliate account */
  @Get('enrollment/plans{/:planId}')
  getPlanDetails(@Param('planId') planId?: string) {
    return this.creditBureauService.getPlanDetails(planId);
  }

  /** Whether an email belongs to an enrolled/active member */
  @Get('enrollment/member-status/:email')
  checkMemberStatus(@Param('email') email: string) {
    return this.creditBureauService.checkMemberStatus(email);
  }

  /** Report for an enrolled member (keyed by member email) */
  @Post('enrollment/report')
  getMemberReport(@Body() dto: MemberReportDto) {
    return this.creditBureauService.getMemberReport(dto);
  }

  // ── Legacy pull + report audit endpoints ────────────────────────────────

  /** Pull a credit report for an already-enrolled member */
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

  /** Config status (no upstream call) — for UI setup hints */
  @Get('status')
  getStatus() {
    return this.creditBureauService.getStatus();
  }
}
