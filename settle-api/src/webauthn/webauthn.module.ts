import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { WebAuthnChallenge } from '../entities/webauthn-challenge.entity';
import { WebAuthnCredential } from '../entities/webauthn-credential.entity';
import { WebAuthnController } from './webauthn.controller';
import { WebAuthnService } from './webauthn.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebAuthnCredential, WebAuthnChallenge, User, RefreshToken]),
    JwtModule.register({}),
  ],
  controllers: [WebAuthnController],
  providers: [WebAuthnService],
  exports: [WebAuthnService],
})
export class WebAuthnModule {}
