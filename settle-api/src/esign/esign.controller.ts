import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request as ExpressRequest, Response } from 'express';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EsignService } from './esign.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class SignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  documentTitle: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  documentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  documentRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  documentText?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  signerName: string;

  @IsIn(['drawn', 'typed'])
  signatureMethod: 'drawn' | 'typed';

  /** base64 (or data-URL) of the fully rendered signed PDF — size-checked
   *  after decode in the service, so no MaxLength here. */
  @IsString()
  @IsNotEmpty()
  signedPdfBase64: string;

  /** CRM client this signature belongs to, when signing from a client
   *  portal surface. Optional. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;

  /** Signer-claimed timestamp for display; the audit row uses server time. */
  @IsOptional()
  @IsISO8601()
  clientSignedAt?: string;
}

/** JWT payload shape produced by JwtStrategy.validate(). */
interface AuthedUser {
  id: string;
  role?: string;
}

type AuthedRequest = ExpressRequest & { user: AuthedUser };

/** Real client IP — same extraction order used by the nurture consent log. */
function extractClientIp(req: ExpressRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(',')[0]?.trim();
  return ip || req.socket?.remoteAddress || req.ip || '';
}

/**
 * Self-hosted e-signature primitive.
 *
 * POST /esign/sign                    — store a signed PDF + audit record
 * GET  /esign/signatures              — list signatures visible to the caller
 * GET  /esign/signatures/:id/download — stream the stored signed PDF
 *
 * IP + user agent are captured server-side — never accepted from the body.
 * The signed PDF lives in a bytea column (no object-storage provider on
 * this deployment), so download streams the bytes rather than a signed URL.
 */
@Controller('esign')
@UseGuards(JwtAuthGuard)
export class EsignController {
  constructor(private readonly esign: EsignService) {}

  @Post('sign')
  sign(@Request() req: AuthedRequest, @Body() dto: SignDto) {
    return this.esign.sign(req.user.id, dto, {
      ip: extractClientIp(req),
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('signatures')
  list(
    @Request() req: AuthedRequest,
    @Query('documentId') documentId?: string,
    @Query('clientId') clientId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.esign.listSignatures(req.user, {
      documentId: documentId || undefined,
      clientId: clientId || undefined,
      userId: userId || undefined,
    });
  }

  @Get('signatures/:id/download')
  async download(
    @Request() req: AuthedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.esign.downloadPdf(req.user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }
}
