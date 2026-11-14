import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditBureauModule } from '../credit-bureau/credit-bureau.module';
import { User } from '../entities/user.entity';
import { CreditMonitorAlert } from './entities/credit-monitor-alert.entity';
import { CreditMonitorEnrollment } from './entities/credit-monitor-enrollment.entity';
import { CreditMonitorSnapshot } from './entities/credit-monitor-snapshot.entity';
import { CreditMonitoringController } from './credit-monitoring.controller';
import { CreditMonitoringService } from './credit-monitoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditMonitorEnrollment,
      CreditMonitorSnapshot,
      CreditMonitorAlert,
      User,
    ]),
    CreditBureauModule,
  ],
  controllers: [CreditMonitoringController],
  providers: [CreditMonitoringService],
  exports: [CreditMonitoringService],
})
export class CreditMonitoringModule {}
