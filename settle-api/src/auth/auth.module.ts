import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WebAuthnModule } from '../webauthn/webauthn.module';
import { WebAuthnController } from './webauthn.controller';
import { TelnyxService } from './telnyx.service';
import { SmsAuthService } from './sms-auth.service';
import { SmsAuthController } from './sms-auth.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { Provider } from '../entities/provider.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { ActivitiesModule } from '../activities/activities.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Provider, RefreshToken]),
    PassportModule,
    ActivitiesModule,
    EmailModule,
    FirebaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret && process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET must be set in production');
        }
        return {
          secret: jwtSecret || 'dev-secret-not-for-production',
          signOptions: {
            expiresIn: '1h',
          },
        };
      },
      inject: [ConfigService],
    }),
    WebAuthnModule,
  ],
  controllers: [AuthController, WebAuthnController, SmsAuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, TelnyxService, SmsAuthService],
  exports: [AuthService],
})
export class AuthModule {}
