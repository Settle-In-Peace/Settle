import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortfolioService } from './portfolio.service';
import {
  CreatePortfolioDto,
  UpdatePortfolioDto,
  PortfolioFilters,
  ImportAccountDto,
  AccountFilters,
  UpdateAccountDto,
} from './portfolio.service';

@Controller('portfolios')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('dashboard/overview')
  getDashboardStats() {
    return this.portfolioService.getDashboardStats();
  }

  @Post()
  createPortfolio(@Body() dto: CreatePortfolioDto) {
    return this.portfolioService.createPortfolio(dto);
  }

  @Get()
  getPortfolios(@Query() filters: PortfolioFilters) {
    return this.portfolioService.getPortfolios(filters);
  }

  @Get(':id')
  getPortfolio(@Param('id') id: string) {
    return this.portfolioService.getPortfolio(id);
  }

  @Put(':id')
  updatePortfolio(@Param('id') id: string, @Body() dto: UpdatePortfolioDto) {
    return this.portfolioService.updatePortfolio(id, dto);
  }

  @Post(':id/accounts')
  importAccounts(
    @Param('id') id: string,
    @Body('accounts') accounts: ImportAccountDto[],
  ) {
    return this.portfolioService.importAccounts(id, accounts ?? []);
  }

  @Get(':id/accounts')
  getPortfolioAccounts(
    @Param('id') id: string,
    @Query() filters: AccountFilters,
  ) {
    return this.portfolioService.getPortfolioAccounts(id, filters);
  }

  @Get(':id/stats')
  getPortfolioStats(@Param('id') id: string) {
    return this.portfolioService.getPortfolioStats(id);
  }

  @Get('accounts/:id')
  getAccount(@Param('id') id: string) {
    return this.portfolioService.getAccount(id);
  }

  @Put('accounts/:id')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.portfolioService.updateAccount(id, dto);
  }
}
