import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SiCreditsService } from './si-credits.service';

/**
 * SI credits — pack catalog + balance reads. Purchasing goes through the
 * existing Stripe checkout surface (POST /stripe/si-credits-checkout →
 * webhook → gateway topup); topup/debit are never exposed to clients.
 */
@Controller('si-credits')
export class SiCreditsController {
  constructor(private readonly siCredits: SiCreditsService) {}

  /** GET /si-credits/packs — public catalog so any client can render packs. */
  @Get('packs')
  getPacks() {
    return {
      configured: this.siCredits.isConfigured(),
      packs: this.siCredits.getPacks(),
    };
  }

  /** GET /si-credits/balance — caller's balance at the shared gateway. */
  @Get('balance')
  @UseGuards(JwtAuthGuard)
  async getBalance(@Req() req: Request & { user: any }) {
    return {
      configured: this.siCredits.isConfigured(),
      balance: await this.siCredits.getBalance(String(req.user.sub)),
    };
  }
}
