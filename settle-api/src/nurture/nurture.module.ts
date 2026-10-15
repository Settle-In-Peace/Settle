import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { NurtureSubscriber } from '../entities/nurture-subscriber.entity';
import { ReviewAsk } from '../entities/review-ask.entity';
import { NurtureController } from './nurture.controller';
import { NurtureService } from './nurture.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NurtureSubscriber, ReviewAsk]),
    EmailModule,
  ],
  controllers: [NurtureController],
  providers: [NurtureService],
})
export class NurtureModule {}
