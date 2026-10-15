import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebtsService } from './debts.service';
import { DebtsController } from './debts.controller';
import { Debt } from '../entities/debt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Debt])],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
