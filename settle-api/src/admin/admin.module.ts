import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { Provider } from '../entities/provider.entity';
import { Lead } from '../entities/lead.entity';
import { Match } from '../entities/match.entity';
import { User } from '../entities/user.entity';
import { EmailModule } from '../email/email.module';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Provider, Lead, Match, User]),
    EmailModule,
    MatchingModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
