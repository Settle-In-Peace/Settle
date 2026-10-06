import { Controller, Post, Body, Headers, UseGuards, Request, Get, UsePipes, ValidationPipe, Put, Delete, Param } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { VerifyEmailDto } from './dtos/verify-email.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute for login
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 refreshes per minute
  @Post('refresh')
  async refreshToken(@Request() req, @Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @SkipThrottle()
  @Post('logout')
  async logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @UsePipes(new ValidationPipe())
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour for registration
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.sub);
  }

  @UsePipes(new ValidationPipe())
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour for password reset
  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    return this.authService.forgotPassword(forgotPasswordDto, internalKey);
  }

  @UsePipes(new ValidationPipe())
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests per hour for reset
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @UsePipes(new ValidationPipe())
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests per hour for verification
  @Post('verify-email')
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto);
  }

  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 requests per hour for resend
  @Post('resend-verification')
  async resendVerificationEmail(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe())
  @Put('profile')
  async updateProfile(@Request() req, @Body() updateProfileDto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.sub, updateProfileDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  async deleteAccount(@Request() req) {
    return this.authService.deleteAccount(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async getActiveSessions(@Request() req) {
    return this.authService.getActiveSessions(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/others')
  async revokeAllOtherSessions(@Request() req, @Body() body: { refreshToken: string }) {
    return this.authService.revokeAllOtherSessions(req.user.sub, body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(@Request() req, @Param('id') sessionId: string) {
    return this.authService.revokeSession(req.user.sub, sessionId);
  }

  // ============================================================
  // OTP via Email
  // ============================================================

  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 per minute
  @Post('send-otp')
  async sendEmailOtp(@Body() body: { email: string }) {
    return this.authService.sendEmailOtp(body.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 per minute
  @Post('verify-otp')
  async verifyEmailOtp(@Body() body: { email: string; code: string }) {
    return this.authService.verifyEmailOtp(body.email, body.code);
  }

  // ============================================================
  // Phone (SMS) Verification
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 per minute
  @Post('send-phone-otp')
  async sendPhoneOtp(@Request() req) {
    return this.authService.sendPhoneOtp(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 per minute
  @Post('verify-phone-otp')
  async verifyPhoneOtp(@Request() req, @Body() body: { code: string }) {
    return this.authService.verifyPhoneOtp(req.user.sub, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-phone-firebase')
  async verifyPhoneFirebase(@Request() req, @Body() body: { idToken: string; phone: string }) {
    return this.authService.verifyPhoneWithFirebase(req.user.sub, body.idToken, body.phone);
  }
}