import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesGuard } from '../auth/guards/sales.guard';
import { CollectionsService } from './collections.service';
import { CreateCollectionAccountDto } from './dto/create-collection-account.dto';
import { UpdateCollectionAccountDto } from './dto/update-collection-account.dto';
import { FilterCollectionAccountDto } from './dto/filter-collection-account.dto';
import { CreateCollectionNoteDto } from './dto/create-collection-note.dto';
import { CreateDebtorProfileDto } from './dto/create-debtor-profile.dto';
import { RunSkipTraceDto } from './dto/run-skip-trace.dto';
import { CreateCallLogDto } from './dto/create-call-log.dto';
import { RunDialerCallDto } from './dto/run-dialer-call.dto';
import { CreateCreditReportDto } from './dto/create-credit-report.dto';
import { CreateBackgroundCheckDto } from './dto/create-background-check.dto';
import { AssignCollectionAccountDto } from './dto/assign-collection-account.dto';
import { IssuePortalLinkDto } from './dto/issue-portal-link.dto';
import { SendPortalLinkDto } from './dto/send-portal-link.dto';
import { ExportPortalLinksDto } from './dto/export-portal-links.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

@Controller('collections')
@UseGuards(JwtAuthGuard, SalesGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('accounts')
  findAll(
    @Query() filter: FilterCollectionAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.user.role === 'sales' && !filter.assignedTo) {
      filter.assignedTo = req.user.sub;
    }
    return this.collectionsService.findAll(filter);
  }

  @Get('accounts/:id')
  findOne(@Param('id') id: string) {
    return this.collectionsService.findOne(id);
  }

  @Post('accounts')
  create(@Body() dto: CreateCollectionAccountDto) {
    return this.collectionsService.create(dto);
  }

  @Put('accounts/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCollectionAccountDto) {
    return this.collectionsService.update(id, dto);
  }

  @Delete('accounts/:id')
  remove(@Param('id') id: string) {
    return this.collectionsService.remove(id);
  }

  @Get('accounts/:id/notes')
  getNotes(@Param('id') id: string) {
    return this.collectionsService.getNotes(id);
  }

  @Post('accounts/:id/notes')
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateCollectionNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.addNote(id, req.user.sub, dto);
  }

  @Get('dashboard')
  getDashboard() {
    return this.collectionsService.getDashboard();
  }

  @Get('debtor-profiles/:crmClientId')
  getDebtorProfile(@Param('crmClientId') crmClientId: string) {
    return this.collectionsService.findDebtorProfile(crmClientId);
  }

  @Post('debtor-profiles')
  createOrUpdateDebtorProfile(@Body() dto: CreateDebtorProfileDto) {
    return this.collectionsService.createOrUpdateDebtorProfile(dto);
  }

  @Post('accounts/:id/skip-trace')
  runSkipTrace(
    @Param('id') id: string,
    @Body() dto: RunSkipTraceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.runSkipTrace(id, req.user.sub, dto);
  }

  @Get('accounts/:id/skip-trace')
  findSkipTraces(@Param('id') id: string) {
    return this.collectionsService.findSkipTraces(id);
  }

  @Post('accounts/:id/calls/dial')
  dialCall(
    @Param('id') id: string,
    @Body() dto: RunDialerCallDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.makeCall(id, req.user.sub, dto);
  }

  @Get('accounts/:id/calls')
  findCallLogs(@Param('id') id: string) {
    return this.collectionsService.findCallLogs(id);
  }

  @Post('accounts/:id/calls')
  createCallLog(
    @Param('id') id: string,
    @Body() dto: CreateCallLogDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.createCallLog(id, req.user.sub, dto);
  }

  @Post('accounts/:id/credit-reports')
  createCreditReport(
    @Param('id') id: string,
    @Body() dto: CreateCreditReportDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.createCreditReport(id, req.user.sub, dto);
  }

  @Get('accounts/:id/credit-reports')
  findCreditReports(@Param('id') id: string) {
    return this.collectionsService.findCreditReports(id);
  }

  @Post('accounts/:id/background-checks')
  createBackgroundCheck(
    @Param('id') id: string,
    @Body() dto: CreateBackgroundCheckDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.createBackgroundCheck(id, req.user.sub, dto);
  }

  @Patch('accounts/:id/assign')
  assignAccount(
    @Param('id') id: string,
    @Body() dto: AssignCollectionAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.assignAccount(id, dto.assignedTo, req.user.sub);
  }

  @Get('accounts/:id/background-checks')
  findBackgroundChecks(@Param('id') id: string) {
    return this.collectionsService.findBackgroundChecks(id);
  }

  /**
   * Mint (or return the existing) debtor payment-portal link.
   * Generation only — delivery is a separate explicit staff action at
   * POST /collections/accounts/:id/portal-link/send.
   */
  @Post('accounts/:id/portal-link')
  issuePortalLink(
    @Param('id') id: string,
    @Body() dto: IssuePortalLinkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.issuePortalLink(id, req.user.sub, dto?.rotate === true);
  }

  /** Revoke the debtor payment-portal link for an account. */
  @Delete('accounts/:id/portal-link')
  revokePortalLink(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.collectionsService.revokePortalLink(id, req.user.sub);
  }

  /**
   * Export a batch of debtor portal links as CSV (debtor name, token,
   * issued/expiry columns) for the staff member to deliver through their
   * own channel. Accounts without a link get one minted; every exported
   * account gets an audit note recording who exported. Export only —
   * the API never sends links to debtors.
   */
  @Post('portal-links/export')
  exportPortalLinks(
    @Body() dto: ExportPortalLinksDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.exportPortalLinks(
      dto.accountIds ?? [],
      req.user.sub,
      dto.note,
    );
  }

  /**
   * Staff-triggered delivery of the debtor payment-portal link by email
   * and/or SMS to the contact info on the account's CRM client. Mints-or-
   * reuses the token; every attempted channel writes a masked audit note.
   * Manual per-account action only — there is no bulk/auto send path.
   */
  @Post('accounts/:id/portal-link/send')
  sendPortalLink(
    @Param('id') id: string,
    @Body() dto: SendPortalLinkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collectionsService.sendPortalLink(id, req.user.sub, dto);
  }
}
