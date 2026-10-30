import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkipTraceLookup } from '../entities/skip-trace-lookup.entity';
import { BatchDataProvider } from './batchdata.provider';
import { SkiptraceController } from './skiptrace.controller';
import { SkiptraceService } from './skiptrace.service';

@Module({
  imports: [TypeOrmModule.forFeature([SkipTraceLookup])],
  controllers: [SkiptraceController],
  providers: [SkiptraceService, BatchDataProvider],
  exports: [SkiptraceService],
})
export class SkiptraceModule {}
