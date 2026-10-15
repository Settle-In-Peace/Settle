import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { DebtSnapshot } from '../entities/nurture-subscriber.entity';
import { NurtureService } from './nurture.service';

class SubscribeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsObject()
  snapshot?: DebtSnapshot;
}

@Controller('nurture')
export class NurtureController {
  constructor(private readonly nurture: NurtureService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('subscribe')
  async subscribe(@Body() body: SubscribeDto, @Request() req: any) {
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0]?.trim();
    return this.nurture.subscribe({
      ...body,
      consentIp: ip || req.socket?.remoteAddress || req.ip || '',
      consentUserAgent: req.headers?.['user-agent'] || '',
    });
  }

  /** One-click unsubscribe — returns a tiny HTML confirmation for link clicks. */
  @Get('unsubscribe')
  async unsubscribe(@Query('token') token: string, @Res() res: Response) {
    const ok = token ? await this.nurture.unsubscribe(token) : false;
    const msg = ok
      ? "You're unsubscribed — no more emails from this series."
      : 'This unsubscribe link is invalid or has expired.';
    res
      .status(ok ? 200 : 400)
      .type('html')
      .send(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center;"><h2 style="color:#18181b;">${ok ? 'Done' : 'Hmm'}</h2><p style="color:#71717a;">${msg}</p><a href="https://settleinpeace.com" style="color:#2563eb;">settleinpeace.com</a></body></html>`,
      );
  }
}
