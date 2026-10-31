import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderGuard } from '../auth/guards/provider.guard';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { EnrollProviderDto } from './dto/enroll-provider.dto';
import { SetProviderPasswordDto } from './dto/set-password.dto';

@Controller('providers')
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

  // Public: consumer comparison page fetches active providers
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get()
  async getActiveProviders(
    @Query('debtType') debtType?: string,
    @Query('state') state?: string,
    @Query('minDebt') minDebt?: string,
  ) {
    return this.providersService.getAllActiveProviders({
      debtType,
      state,
      minDebt: minDebt ? parseFloat(minDebt) : undefined,
    });
  }

  // Public: single provider profile page (internal/billing fields stripped)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get(':id')
  async getProvider(@Param('id') id: string) {
    return this.providersService.getPublicProviderById(id);
  }

  // Public: aggregate stat for the /providers page (counts only, no records)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('public/count')
  async getPublicCount() {
    return this.providersService.getPublicCounts();
  }

  // Public: provider signup (creates pending account awaiting admin approval)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Post('signup')
  async signupProvider(@Body() body: CreateProviderDto) {
    return this.providersService.createProvider(body);
  }

  // Public: lightweight enrollment — no password. Creates a 'pending_review'
  // row; the provider sets a password via emailed link after approval.
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('enroll')
  async enrollProvider(@Body() body: EnrollProviderDto) {
    return this.providersService.enrollProvider(body);
  }

  // Public: redeem a password-setup token (emailed on approval) and set the
  // provider's portal password.
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('set-password')
  async setPassword(@Body() body: SetProviderPasswordDto) {
    return this.providersService.setPasswordWithToken(body.token, body.password);
  }

  // Provider: update their own profile
  @SkipThrottle()
  @Put('profile')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async updateProfile(@Request() req, @Body() body: UpdateProviderDto) {
    return this.providersService.updateProvider(req.user.sub, body);
  }

  // Provider: get own stats
  @SkipThrottle()
  @Get('portal/stats')
  @UseGuards(JwtAuthGuard, ProviderGuard)
  async getStats(@Request() req) {
    return this.providersService.getProviderStats(req.user.sub);
  }
}