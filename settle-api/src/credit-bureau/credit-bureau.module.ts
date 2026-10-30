import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditReport } from '../entities/credit-report.entity';
import { CreditBureauController } from './credit-bureau.controller';
import { CreditBureauService } from './credit-bureau.service';
import { MyFreeScoreNowProvider } from './providers/myfreescorenow.provider';
import { SmartCreditProvider } from './providers/smartcredit.provider';

@Module({
  imports: [TypeOrmModule.forFeature([CreditReport])],
  controllers: [CreditBureauController],
  providers: [CreditBureauService, MyFreeScoreNowProvider, SmartCreditProvider],
  exports: [CreditBureauService],
})
export class CreditBureauModule {}
