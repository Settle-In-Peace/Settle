import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentPlan } from '../entities/payment-plan.entity';
import { PaymentPlanPayment } from '../entities/payment-plan-payment.entity';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentPlansService } from './payment-plans.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentPlan, PaymentPlanPayment])],
  controllers: [PaymentPlansController],
  providers: [PaymentPlansService],
  exports: [PaymentPlansService],
})
export class PaymentPlansModule {}
