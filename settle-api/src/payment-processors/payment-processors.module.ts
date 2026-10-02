import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessorPayment } from '../entities/processor-payment.entity';
import { PaymentProcessorsController } from './payment-processors.controller';
import { PaymentProcessorsService } from './payment-processors.service';
import { NmiProvider } from './providers/nmi.provider';
import { AuthorizeNetProvider } from './providers/authorizenet.provider';
import { StripeProcessorProvider } from './providers/stripe.processor-provider';

/**
 * High-risk payment processor layer (debt collection MCC).
 *
 * Registration — this module is NOT wired into AppModule by this commit to
 * avoid colliding with concurrent work. To enable, add to app.module.ts:
 *
 *   import { PaymentProcessorsModule } from './payment-processors/payment-processors.module';
 *   ...
 *   imports: [ ..., PaymentProcessorsModule ]
 *
 * and register the entity + migration (see README.md in this directory).
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProcessorPayment])],
  controllers: [PaymentProcessorsController],
  providers: [
    PaymentProcessorsService,
    NmiProvider,
    AuthorizeNetProvider,
    StripeProcessorProvider,
  ],
  exports: [PaymentProcessorsService],
})
export class PaymentProcessorsModule {}
