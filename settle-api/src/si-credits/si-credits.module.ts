import { Module } from '@nestjs/common';
import { SiCreditsController } from './si-credits.controller';
import { SiCreditsService } from './si-credits.service';

@Module({
  controllers: [SiCreditsController],
  providers: [SiCreditsService],
  exports: [SiCreditsService],
})
export class SiCreditsModule {}
