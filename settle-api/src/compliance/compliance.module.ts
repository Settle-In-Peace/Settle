import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceService } from './compliance.service';
import { DncEntry } from '../entities/dnc-entry.entity';
import { ConsentLog } from '../entities/consent-log.entity';
import { CallLog } from '../entities/call-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DncEntry, ConsentLog, CallLog])],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
