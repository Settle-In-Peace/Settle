import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { RefreshToken } from '../entities/refresh-token.entity';
import { WebAuthnChallenge } from '../entities/webauthn-challenge.entity';
import { WebAuthnCredential } from '../entities/webauthn-credential.entity';
import { User } from '../entities/user.entity';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(WebAuthnCredential)
    private readonly credentials: Repository<WebAuthnCredential>,
    @InjectRepository(WebAuthnChallenge)
    private readonly challenges: Repository<WebAuthnChallenge>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /** Issue the same token pair the password login returns — passkey sessions are identical. */
  async issueTokens(userId: string, reqInfo?: { ipAddress?: string; userAgent?: string }) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || (user as any).deletedAt) throw new UnauthorizedException('Invalid passkey');
    const payload = {
      sub: user.id,
      email: user.email,
      role: (user as any).role || 'customer',
      firstName: (user as any).firstName,
      lastName: (user as any).lastName,
      phone: (user as any).phone,
      // amr = Authentication Methods Reference (RFC 8176). A passkey session is
      // possession + user-verification — the MFA-equivalent claim credit-data
      // access requires under MFSN §5.5.1.
      amr: ['passkey', 'mfa'],
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h', secret: process.env.JWT_SECRET, algorithm: 'HS256' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d', secret: process.env.JWT_REFRESH_SECRET, algorithm: 'HS256' });
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.refreshTokens.save(this.refreshTokens.create({
      userId: user.id, tokenHash, ipAddress: reqInfo?.ipAddress, userAgent: reqInfo?.userAgent,
    }));
    return {
      success: true,
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: {
        id: user.id, email: user.email, role: payload.role,
        firstName: payload.firstName, lastName: payload.lastName, phone: payload.phone,
        createdAt: (user as any).createdAt,
      },
    };
  }

  private get rpId() {
    return this.config.get<string>('WEBAUTHN_RP_ID', 'settleinpeace.com');
  }
  private get rpName() {
    return this.config.get<string>('WEBAUTHN_RP_NAME', 'Settle In Peace');
  }
  private get origins(): string[] {
    const o = this.config.get<string>('WEBAUTHN_ORIGIN', 'https://www.settleinpeace.com');
    return o.split(',').map((s) => s.trim());
  }

  private async storeChallenge(challenge: string, type: string, userId?: string) {
    await this.challenges.save(
      this.challenges.create({
        challenge,
        type,
        userId,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      }),
    );
  }


  // ── Registration (logged-in user adds a passkey) ────────────────────────

  async registrationOptions(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const existing = await this.credentials.find({ where: { userId } });
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports as any,
      })),
      authenticatorSelection: {
        residentKey: 'required', // discoverable credential → userless sign-in
        userVerification: 'preferred',
      },
    });
    await this.storeChallenge(options.challenge, 'register', userId);
    return options;
  }

  async verifyRegistration(userId: string, response: any, deviceName?: string) {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: async (challenge: string) => {
        const stored = await this.challenges.findOne({
          where: { challenge, type: 'register', expiresAt: MoreThan(new Date()) },
        });
        if (stored) {
          await this.challenges.delete(stored.id);
          return true;
        }
        return false;
      },
      expectedOrigin: this.origins,
      expectedRPID: this.rpId,
    } as any).catch((e) => {
      throw new BadRequestException(`Passkey registration failed: ${e?.message || e}`);
    });

    const info = verification.registrationInfo;
    if (!verification.verified || !info) throw new BadRequestException('Passkey verification failed');

    const saved = await this.credentials.save(
      this.credentials.create({
        userId,
        credentialId: info.credentialID,
        publicKey: Buffer.from(info.credentialPublicKey).toString('base64url'),
        counter: String(info.counter),
        transports: (info as any).transports,
        deviceName: deviceName?.slice(0, 120),
        backedUp: (info as any).credentialBackedUp ?? false,
      }),
    );
    this.logger.log(`Passkey registered for user ${userId} (cred ${saved.id})`);
    return { id: saved.id, deviceName: saved.deviceName };
  }

  // ── Authentication (userless sign-in via discoverable credential) ──────

  async authenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      userVerification: 'preferred',
      // No allowCredentials → discoverable credentials; the authenticator
      // returns the userHandle and we resolve the account from the credential.
    });
    await this.storeChallenge(options.challenge, 'authenticate');
    return options;
  }

  /** Verify an assertion and resolve the owning user id. */
  async verifyAuthentication(response: any): Promise<string> {
    const cred = await this.credentials.findOne({ where: { credentialId: response.id } });
    if (!cred) throw new UnauthorizedException('Unknown passkey — register it on a logged-in device first.');

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: async (challenge: string) => {
        const stored = await this.challenges.findOne({
          where: { challenge, type: 'authenticate', expiresAt: MoreThan(new Date()) },
        });
        if (stored) {
          await this.challenges.delete(stored.id);
          return true;
        }
        return false;
      },
      expectedOrigin: this.origins,
      expectedRPID: this.rpId,
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: Number(cred.counter),
        transports: cred.transports as any,
      },
    } as any).catch((e) => {
      throw new UnauthorizedException(`Passkey verification failed: ${e?.message || e}`);
    });

    if (!verification.verified) throw new UnauthorizedException('Passkey verification failed');

    const newCounter = verification.authenticationInfo?.newCounter;
    cred.counter = String(newCounter ?? Number(cred.counter) + 1);
    cred.lastUsedAt = new Date();
    await this.credentials.save(cred);

    return cred.userId;
  }

  async listCredentials(userId: string) {
    const rows = await this.credentials.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return rows.map(({ id, deviceName, transports, backedUp, lastUsedAt, createdAt }) => ({
      id,
      deviceName,
      transports,
      backedUp,
      lastUsedAt,
      createdAt,
    }));
  }

  async removeAllCredentials(userId: string) {
    await this.credentials.delete({ userId });
    return { success: true };
  }

  async removeCredential(userId: string, id: string) {
    const row = await this.credentials.findOne({ where: { id, userId } });
    if (!row) throw new BadRequestException('Passkey not found');
    await this.credentials.delete(row.id);
    return { removed: true };
  }

}
