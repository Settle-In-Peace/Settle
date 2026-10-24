import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EsignSignature } from '../entities/esign-signature.entity';
import { EsignController } from './esign.controller';
import { EsignService } from './esign.service';

/**
 * E-sign module — self-hosted signature capture. The signed PDF is stored
 * inline on the audit row (bytea); there is no external storage dependency.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EsignSignature])],
  controllers: [EsignController],
  providers: [EsignService],
  exports: [EsignService],
})
export class EsignModule {}
