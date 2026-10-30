import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderGuard } from '../auth/guards/provider.guard';
import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

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

  // Public: provider signup (creates pending account awaiting admin approval)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Post('signup')
  async signupProvider(@Body() body: CreateProviderDto) {
    return this.providersService.createProvider(body);
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