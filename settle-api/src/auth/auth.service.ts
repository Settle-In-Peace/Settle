import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';
import { Provider } from '../entities/provider.entity';
import { RegisterDto } from './dtos/register.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { VerifyEmailDto } from './dtos/verify-email.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { ActivitiesService } from '../activities/activities.service';
import { EmailService } from '../email/email.service';
import { TelnyxService } from './telnyx.service';
import { FirebaseService } from '../firebase/firebase.service';
import { RefreshToken } from '../entities/refresh-token.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private activitiesService: ActivitiesService,
    private emailService: EmailService,
    private telnyxService: TelnyxService,
    private firebaseService: FirebaseService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    // Check regular users first
    const user = await this.usersRepository.findOne({ where: { email } });
    if (user && user.password) {
      if (user.deletedAt) {
        return null;
      }
      if (user.lockoutExpiresAt && user.lockoutExpiresAt > new Date()) {
        throw new ForbiddenException('Account is temporarily locked. Please try again in 15 minutes.');
      }
      if (user.accountLocked || user.failedLoginAttempts || user.lockoutExpiresAt) {
        await this.usersRepository.update(user.id, {
          accountLocked: false,
          failedLoginAttempts: 0,
          lockoutExpiresAt: null,
        });
      }

      try {
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (isPasswordValid) {
          await this.usersRepository.update(user.id, {
            accountLocked: false,
            failedLoginAttempts: 0,
            lockoutExpiresAt: null,
          });
          const { password: _, ...result } = user;
          return result;
        }
        await this.recordFailedLogin(user);
      } catch {
        await this.recordFailedLogin(user);
      }
    }

    // Check providers (the email might belong to a provider, not a user)
    const provider = await this.providersRepository.findOne({ where: { email } });
    if (provider && provider.password) {
      try {
        const isPasswordValid = await bcrypt.compare(password, provider.password);
        if (isPasswordValid) {
          const { password: _, ...result } = provider;
          return {
            ...result,
            role: 'provider',
            firstName: provider.companyName,
            lastName: '',
            phone: provider.phone || '',
          };
        }
      } catch {
        // Invalid hash
      }
    }

    return null;
  }

  private async generateTokens(user: any, reqInfo?: { ipAddress?: string; userAgent?: string }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role || 'customer',
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '1h',
      secret: process.env.JWT_SECRET,
      algorithm: 'HS256',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_REFRESH_SECRET,
      algorithm: 'HS256',
    });

    // Store refresh token hash for session management
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshTokenRecord = this.refreshTokensRepository.create({
      userId: user.id,
      tokenHash,
      ipAddress: reqInfo?.ipAddress,
      userAgent: reqInfo?.userAgent,
    });
    await this.refreshTokensRepository.save(refreshTokenRecord);

    return { accessToken, refreshToken, expiresIn: 60 * 60 }; // 1 hour in seconds
  }

  // Public method for passkey login (called from WebAuthnController)
  async generateTokensForUser(user: any, reqInfo?: { ipAddress?: string; userAgent?: string }) {
    return this.generateTokens(user, reqInfo);
  }

  async login(user: any, reqInfo?: { ipAddress?: string; userAgent?: string }) {
    // Customers must verify their email with an OTP before receiving tokens
    if (user.role !== 'provider' && !user.emailVerified) {
      const otpResult = await this.sendEmailOtp(user.email);
      return {
        success: true,
        requiresVerification: true,
        email: user.email,
        message: otpResult.message || 'Please verify your email with the code we sent.',
        ...(otpResult.devCode && process.env.NODE_ENV === 'development' ? { devCode: otpResult.devCode } : {}),
      };
    }

    const tokens = await this.generateTokens(user, reqInfo);

    // Log login activity (skip for providers — they don't have an activities table row)
    if (user.role !== 'provider') {
      try {
        await this.activitiesService.createActivity(
          user.id,
          'login',
          'User logged in',
          { email: user.email }
        );
      } catch {
        // Activity logging is non-critical
      }
    }

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'customer',
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        createdAt: user.createdAt,
      },
    };
  }

  async refreshToken(refreshToken: string, reqInfo?: { ipAddress?: string; userAgent?: string }) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
      });

      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const storedToken = await this.refreshTokensRepository.findOne({
        where: { tokenHash, userId: payload.sub },
      });

      if (!storedToken || storedToken.revokedAt) {
        throw new UnauthorizedException('Invalid or revoked refresh token');
      }

      // Look up the user to ensure they still exist and are valid
      const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
      if (!user || user.deletedAt) {
        throw new UnauthorizedException('User not found');
      }

      // Revoke the current refresh token and issue a new pair (rotation)
      storedToken.revokedAt = new Date();
      await this.refreshTokensRepository.save(storedToken);

      const tokens = await this.generateTokens(user, reqInfo);

      return {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.refreshTokensRepository.update({ tokenHash }, { revokedAt: new Date() });
    return { success: true, message: 'Logged out successfully' };
  }

  async getActiveSessions(userId: string) {
    const sessions = await this.refreshTokensRepository.find({
      where: { userId, revokedAt: null },
      order: { createdAt: 'DESC' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      isCurrent: false, // caller can override based on provided token
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.refreshTokensRepository.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new BadRequestException('Session not found');
    }
    session.revokedAt = new Date();
    await this.refreshTokensRepository.save(session);
    return { success: true, message: 'Session revoked' };
  }

  async revokeAllOtherSessions(userId: string, currentRefreshToken: string) {
    const currentTokenHash = crypto.createHash('sha256').update(currentRefreshToken).digest('hex');
    const currentSession = await this.refreshTokensRepository.findOne({
      where: { tokenHash: currentTokenHash, userId, revokedAt: null },
    });

    const currentSessionId = currentSession?.id;

    await this.refreshTokensRepository.createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .andWhere(currentSessionId ? 'id != :currentSessionId' : '1=1', currentSessionId ? { currentSessionId } : {})
      .execute();

    return { success: true, message: 'All other sessions logged out' };
  }

  async register(registerDto: RegisterDto) {
    if (!this.isPasswordComplex(registerDto.password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
      );
    }

    const existingUser = await this.usersRepository.findOne({ 
      where: { email: registerDto.email } 
    });
    if (existingUser) {
      throw new UnauthorizedException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const verificationToken = this.generateSecureToken();
    const verificationExpires = new Date();
    verificationExpires.setHours(verificationExpires.getHours() + 24); // 24 hours

    const user = this.usersRepository.create({
      email: registerDto.email,
      password: hashedPassword,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      phone: registerDto.phone,
      role: 'customer',
      emailVerified: false,
    });

    await this.usersRepository.save(user);

    // Log registration activity
    await this.activitiesService.createActivity(
      user.id,
      'register',
      'User registered',
      { email: user.email, firstName: user.firstName, lastName: user.lastName }
    );

    // Send email OTP for verification (logged to console in dev mode when no RESEND_API_KEY)
    const otpResult = await this.sendEmailOtp(user.email);

    return {
      success: true,
      requiresVerification: true,
      email: user.email,
      message: otpResult.message || 'Check your email for a verification code.',
      ...(otpResult.devCode && process.env.NODE_ENV === 'development' ? { devCode: otpResult.devCode } : {}),
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { password: _, ...result } = user;
    return result;
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto, internalKey?: string) {
    // Internal service key (trusted web edge) unlocks reset internals so the
    // frontend can send a fallback email when our mailer fails. Normal clients
    // never receive those fields.
    const isInternal =
      !!process.env.INTERNAL_API_KEY &&
      internalKey === process.env.INTERNAL_API_KEY;

    const user = await this.usersRepository.findOne({
      where: { email: forgotPasswordDto.email }
    });

    if (!user) {
      // Don't reveal if email exists for security
      return { success: true, message: 'If email exists, password reset link sent' };
    }

    // Generate reset token
    const resetToken = this.generateSecureToken();
    const resetTokenExpires = new Date();
    resetTokenExpires.setHours(resetTokenExpires.getHours() + 1); // 1 hour expiration

    await this.usersRepository.update(user.id, {
      resetToken,
      resetTokenExpires,
    });

    // Send password reset email (logged to console in dev mode when no RESEND_API_KEY)
    const emailSent = await this.emailService.sendPasswordResetEmail(user.email, resetToken, user.firstName);

    const response: Record<string, unknown> = {
      success: true,
      message: 'Password reset link sent',
    };
    if (isInternal) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
      response._resetToken = resetToken;
      response._emailSent = emailSent;
      response._sendTo = user.email;
      response._firstName = user.firstName;
      response._resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    }
    return response;
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.usersRepository.findOne({ 
      where: { resetToken: resetPasswordDto.token } 
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (user.resetTokenExpires && user.resetTokenExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    if (resetPasswordDto.password !== resetPasswordDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const hashedPassword = await bcrypt.hash(resetPasswordDto.password, 10);

    await this.usersRepository.update(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null,
      lastPasswordChangeAt: new Date(),
    });

    // Send password reset confirmation email (logged to console in dev mode)
    try {
      await this.emailService.sendPasswordResetConfirmation(user);
    } catch (err) {
      this.logger.error(`Failed to send password reset confirmation: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { success: true, message: 'Password reset successfully' };
  }

  private async recordFailedLogin(user: User): Promise<void> {
    const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    const accountLocked = failedLoginAttempts >= 5;
    const lockoutExpiresAt = accountLocked ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await this.usersRepository.update(user.id, {
      failedLoginAttempts,
      lastFailedLoginAt: new Date(),
      accountLocked,
      lockoutExpiresAt,
    });
  }

  private isPasswordComplex(password: string): boolean {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
  }

  private generateSecureToken(): string {
    // Generate a cryptographically secure random token
    const array = new Uint32Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16)).join('');
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const user = await this.usersRepository.findOne({ 
      where: { emailVerificationToken: verifyEmailDto.token } 
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.usersRepository.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });

    return { success: true, message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.usersRepository.findOne({ where: { email } });
    
    if (!user) {
      // Don't reveal if email exists for security
      return { success: true, message: 'If email exists, verification link sent' };
    }

    if (user.emailVerified) {
      return { success: true, message: 'Email already verified' };
    }

    const verificationToken = this.generateSecureToken();
    const verificationExpires = new Date();
    verificationExpires.setHours(verificationExpires.getHours() + 24);

    await this.usersRepository.update(user.id, {
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, verificationToken, user.firstName);

    return {
      success: true,
      message: 'Verification email sent',
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if email is being changed and if it's already taken
    if (updateProfileDto.email && updateProfileDto.email !== user.email) {
      const existingUser = await this.usersRepository.findOne({ 
        where: { email: updateProfileDto.email } 
      });
      if (existingUser) {
        throw new BadRequestException('Email already in use');
      }
    }

    // Reset phone verification if phone number changed
    const phoneChanged = updateProfileDto.phone && updateProfileDto.phone !== user.phone;

    await this.usersRepository.update(userId, {
      firstName: updateProfileDto.firstName,
      lastName: updateProfileDto.lastName,
      email: updateProfileDto.email,
      phone: updateProfileDto.phone,
      emailNotifications: updateProfileDto.emailNotifications,
      smsNotifications: updateProfileDto.smsNotifications,
      ...(phoneChanged ? { phoneVerified: false } : {}),
    });

    // Log profile update activity
    await this.activitiesService.createActivity(
      userId,
      'profile_update',
      'User updated profile',
      { changes: updateProfileDto }
    );

    const updatedUser = await this.usersRepository.findOne({ where: { id: userId } });
    const { password: _, ...result } = updatedUser!;
    return result;
  }

  async deleteAccount(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.usersRepository.update(userId, { deletedAt: new Date() });

    await this.activitiesService.createActivity(
      userId,
      'account_deleted',
      'User deleted their account',
      { email: user.email }
    );

    return { success: true, message: 'Account deleted successfully' };
  }

  // ============================================================
  // OTP via Email
  // ============================================================

  async sendEmailOtp(email: string): Promise<{ success: boolean; message: string; devCode?: string }> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      // Don't reveal if email exists for security
      return { success: true, message: 'If an account exists, a verification code was sent' };
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 10); // 10 minute expiry

    await this.usersRepository.update(user.id, {
      otpCode: code,
      otpExpires: expires,
      otpAttempts: 0,
    });

    const sent = await this.emailService.sendOtpEmail(email, code, user.firstName);

    // In dev mode (no RESEND_API_KEY) or if email fails, return the code for testing
    if (!process.env.RESEND_API_KEY) {
      return { success: true, message: 'Verification code sent (dev mode)', devCode: process.env.NODE_ENV === 'development' ? code : undefined };
    }

    if (!sent) {
      return { success: false, message: 'Failed to send verification code', devCode: process.env.NODE_ENV === 'development' ? code : undefined };
    }

    return { success: true, message: 'Verification code sent to your email' };
  }

  async verifyEmailOtp(email: string, code: string) {
    // Use a query builder to select the otpCode column (it's select: false in entity)
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.otpCode')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or code');
    }

    if (!user.otpCode || !user.otpExpires) {
      throw new BadRequestException('No verification code was sent. Please request a new code.');
    }

    if (user.otpExpires < new Date()) {
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    // Check attempt limit
    if ((user.otpAttempts || 0) >= 5) {
      throw new BadRequestException('Too many attempts. Please request a new code.');
    }

    if (user.otpCode !== code) {
      await this.usersRepository.update(user.id, {
        otpAttempts: (user.otpAttempts || 0) + 1,
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    // Clear OTP and mark email verified
    await this.usersRepository.update(user.id, {
      otpCode: null,
      otpExpires: null,
      otpAttempts: 0,
      emailVerified: true,
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    await this.activitiesService.createActivity(
      user.id,
      'otp_login',
      'User logged in via email OTP',
      { email: user.email },
    );

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'customer',
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        createdAt: user.createdAt,
      },
    };
  }

  // ============================================================
  // Phone (SMS) Verification
  // ============================================================

  async sendPhoneOtp(userId: string): Promise<{ success: boolean; message: string; devCode?: string }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.phone) {
      throw new BadRequestException('No phone number on file. Please add a phone number first.');
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 10);

    await this.usersRepository.update(userId, {
      phoneOtpCode: code,
      phoneOtpExpires: expires,
      phoneOtpAttempts: 0,
    });

    const result = await this.telnyxService.sendOTP(user.phone, code);

    if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_FROM_NUMBER) {
      this.logger.log(`[DEV SMS] Phone OTP for ${user.phone}: ${code}`);
      return { success: true, message: 'Verification code sent (dev mode)', devCode: process.env.NODE_ENV === 'development' ? code : undefined };
    }

    if (!result.success) {
      return { success: false, message: result.error || 'Failed to send SMS', devCode: process.env.NODE_ENV === 'development' ? code : undefined };
    }

    return { success: true, message: 'Verification code sent to your phone' };
  }

  async verifyPhoneOtp(userId: string, code: string): Promise<{ success: boolean; message: string }> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.phoneOtpCode')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.phoneOtpCode || !user.phoneOtpExpires) {
      throw new BadRequestException('No verification code was sent. Please request a new code.');
    }

    if (user.phoneOtpExpires < new Date()) {
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    if ((user.phoneOtpAttempts || 0) >= 5) {
      throw new BadRequestException('Too many attempts. Please request a new code.');
    }

    if (user.phoneOtpCode !== code) {
      await this.usersRepository.update(userId, {
        phoneOtpAttempts: (user.phoneOtpAttempts || 0) + 1,
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.usersRepository.update(userId, {
      phoneOtpCode: null,
      phoneOtpExpires: null,
      phoneOtpAttempts: 0,
      phoneVerified: true,
    });

    await this.activitiesService.createActivity(
      userId,
      'phone_verified',
      'User verified phone number',
      { phone: user.phone },
    );

    return { success: true, message: 'Phone number verified' };
  }

  async verifyPhoneWithFirebase(
    userId: string,
    idToken: string,
    phone: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const result = await this.firebaseService.verifyPhoneToken(idToken, phone);
    if (!result.success) {
      throw new UnauthorizedException(result.error || 'Invalid phone verification token');
    }

    await this.usersRepository.update(userId, {
      phone,
      phoneVerified: true,
    });

    await this.activitiesService.createActivity(
      userId,
      'phone_verified',
      'User verified phone number with Firebase',
      { phone },
    );

    return { success: true, message: 'Phone number verified' };
  }
}