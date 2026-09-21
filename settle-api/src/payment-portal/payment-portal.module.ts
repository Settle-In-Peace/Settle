import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionAccount } from '../entities/collection-account.entity';
import { PaymentPlan } from '../entities/payment-plan.entity';
import { PaymentPlanPayment } from '../entities/payment-plan-payment.entity';
import { Settlement } from '../entities/settlement.entity';
import { SettlementPayment } from '../entities/settlement-payment.entity';
import { PaymentPortalController } from './payment-portal.controller';
import { PaymentPortalService } from './payment-portal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CollectionAccount,
      PaymentPlan,
      PaymentPlanPayment,
      Settlement,
      SettlementPayment,
    ]),
  ],
  controllers: [PaymentPortalController],
  providers: [PaymentPortalService],
  exports: [PaymentPortalService],
})
export class PaymentPortalModule {}
