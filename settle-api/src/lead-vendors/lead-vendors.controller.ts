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

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5MB

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
   * CSV import. Accepts either:
   *   - application/json { vendor, filename?, csv }  (file contents in `csv`)
   *   - text/csv (or application/octet-stream) raw file bytes with
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
    let vendor = vendorQuery || body?.vendor;
    let filename = filenameQuery || body?.filename;
    let csv = body?.csv;

    if (!contentType.includes('application/json')) {
      // Raw file body — read the stream ourselves (the JSON parser skipped it).
      csv = await this.readRawBody(req);
      if (!vendor) {
        throw new BadRequestException(
          'vendor is required (query param or JSON field)',
        );
      }
    }
    if (!vendor) throw new BadRequestException('vendor is required');
    if (!csv || !csv.trim()) throw new BadRequestException('csv content is empty');

    return this.leadVendorsService.importCsv(
      vendor,
      csv,
      filename,
      req.user.sub,
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

  private async readRawBody(req: Request): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_CSV_BYTES) {
        throw new BadRequestException('CSV too large (max 5MB)');
      }
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
