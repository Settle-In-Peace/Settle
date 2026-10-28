import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesGuard } from '../auth/guards/sales.guard';
import { LeadVendorsService } from './lead-vendors.service';
import { LeadCriteria } from './lead-vendor-provider.interface';
import { PurchaseLeadsDto } from './dto/purchase-leads.dto';
import { ImportCsvDto } from './dto/import-csv.dto';
import { ListImportedLeadsDto } from './dto/list-imported-leads.dto';
import { UpsertVendorAccountDto } from './dto/upsert-vendor-account.dto';
import { BatchSkipTraceDto } from './dto/batch-skip-trace.dto';
import { BatchCampaignDto } from './dto/batch-campaign.dto';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB (xlsx compresses worse than csv)

interface AuthenticatedRequest extends Request {
  user: { sub: string; id: string; role: string; email: string };
}

/**
 * Lead-vendor management — sales/admin only.
 * Purchase endpoints are rate-limited tighter than the global throttler
 * (money moves); everything else uses the default app-wide limits.
 */
@Controller('lead-vendors')
@UseGuards(JwtAuthGuard, SalesGuard)
export class LeadVendorsController {
  constructor(private readonly leadVendorsService: LeadVendorsService) {}

  /** Vendor status cards — configured/active/products per vendor. */
  @Get()
  listVendors() {
    return this.leadVendorsService.listVendors();
  }

  @Get('status')
  getStatuses() {
    return this.leadVendorsService.listVendors();
  }

  @Get('vendors/:name')
  getVendor(@Param('name') name: string) {
    return this.leadVendorsService.getVendor(name);
  }

  /** Persisted vendor account rows (non-secret config only). */
  @Get('accounts')
  listAccounts() {
    return this.leadVendorsService.listAccounts();
  }

  /** Create/update a vendor account — activate, display config, refs. */
  @Post('accounts')
  upsertAccount(@Body() dto: UpsertVendorAccountDto) {
    return this.leadVendorsService.upsertAccount(dto);
  }

  /** Price quote for lead criteria — a ping without a purchase. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('price')
  priceLead(
    @Body() body: { vendor: string } & LeadCriteria,
  ) {
    if (!body?.vendor) throw new BadRequestException('vendor is required');
    const { vendor, ...criteria } = body;
    return this.leadVendorsService.priceLead(vendor, criteria);
  }

  /** Buy leads from a vendor. Strictly throttled — real money. */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('purchase')
  purchaseLeads(
    @Body() dto: PurchaseLeadsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadVendorsService.purchaseLeads(dto, req.user.sub);
  }

  @Get('purchases')
  listPurchases(@Query('vendor') vendor?: string) {
    return this.leadVendorsService.listPurchases(vendor);
  }

  /**
   * CSV + Excel (.xlsx) import. Accepts:
   *   - application/json { vendor, filename?, csv }  (file text in `csv`;
   *     for a `.xlsx` filename, `csv` may carry base64 workbook bytes)
   *   - text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
   *     or application/octet-stream raw file bytes with
   *     ?vendor=<name>&filename=<name> query params
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('import/csv')
  async importCsv(
    @Req() req: AuthenticatedRequest,
    @Body() body: ImportCsvDto,
    @Query('vendor') vendorQuery?: string,
    @Query('filename') filenameQuery?: string,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    const vendor = vendorQuery || body?.vendor;
    const filename = filenameQuery || body?.filename;

    let file: Buffer;
    if (contentType.includes('application/json')) {
      const payload = body?.csv;
      if (!payload || !payload.trim()) {
        throw new BadRequestException('file content is empty');
      }
      // JSON path: .xlsx filenames carry base64 workbook bytes, else CSV text.
      file = /\.xlsx$/i.test(filename ?? '')
        ? Buffer.from(payload, 'base64')
        : Buffer.from(payload, 'utf8');
    } else {
      // Raw file body — read the stream ourselves (the JSON parser skipped it).
      file = await this.readRawBody(req);
      if (!vendor) {
        throw new BadRequestException(
          'vendor is required (query param or JSON field)',
        );
      }
    }
    if (!vendor) throw new BadRequestException('vendor is required');
    if (!file.length) throw new BadRequestException('file content is empty');

    return this.leadVendorsService.importFile(
      vendor,
      file,
      filename,
      contentType,
      req.user.sub,
    );
  }

  /**
   * Skip-trace queue for a batch's phoneless leads — creates pending
   * skip_trace_results rows and runs them through the configured provider
   * (stub → status 'manual' until a real vendor is wired). Max 500/run.
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('import/:batchId/skip-trace')
  queueBatchSkipTrace(
    @Param('batchId') batchId: string,
    @Body() dto: BatchSkipTraceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadVendorsService.queueBatchSkipTrace(
      batchId,
      req.user.sub,
      dto ?? {},
    );
  }

  /** Skip-trace results for a batch — the manual review queue. */
  @Get('import/:batchId/skip-trace')
  listBatchSkipTraces(@Param('batchId') batchId: string) {
    return this.leadVendorsService.listBatchSkipTraces(batchId);
  }

  /**
   * Chain the batch into a dialer campaign — resolves each lead's first
   * dialable phone (primary → altPhones), skips phoneless/DNC rows, and
   * hands contacts to the same DNC + consent-gated campaign runner.
   */
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('import/:batchId/campaign')
  startBatchCampaign(
    @Param('batchId') batchId: string,
    @Body() dto: BatchCampaignDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadVendorsService.startBatchCampaign(
      batchId,
      req.user.sub,
      dto,
    );
  }

  @Get('batches')
  listBatches(@Query('vendor') vendor?: string) {
    return this.leadVendorsService.listBatches(vendor);
  }

  /** Imported/purchased vendor leads with filters. */
  @Get('leads')
  listLeads(@Query() filter: ListImportedLeadsDto) {
    return this.leadVendorsService.listLeads(filter);
  }

  @Get('leads/:id')
  getLead(@Param('id') id: string) {
    return this.leadVendorsService.getLead(id);
  }

  /** Handoff: convert an imported lead into a collections account. */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('leads/:id/assign-collections')
  assignToCollections(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.leadVendorsService.assignToCollections(id, req.user.sub);
  }

  private async readRawBody(req: Request): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_FILE_BYTES) {
        throw new BadRequestException('File too large (max 10MB)');
      }
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }
}
