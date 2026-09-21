import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import {
  DebtPortfolio,
  DebtPortfolioAccount,
} from '../entities/debt-portfolio.entity';
import { CollectionAccount } from '../entities/collection-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DebtPortfolio,
      DebtPortfolioAccount,
      CollectionAccount,
    ]),
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
