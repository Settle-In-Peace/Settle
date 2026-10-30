import { Controller, Get, Post, Delete, Body, UseGuards, Request } from '@nestjs/common';
import { WebAuthnService } from '../webauthn/webauthn.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Legacy /auth/passkey routes — kept for the existing frontend (login,
 * register, settings). Delegates to the multi-credential WebAuthnService;
 * newer surfaces should prefer /webauthn/*.
 */
@Controller('auth/passkey')
export class WebAuthnController {
  constructor(private readonly webauthnService: WebAuthnService) {}

  @UseGuards(JwtAuthGuard)
  @Post('register/options')
  registerOptions(@Request() req) {
    return this.webauthnService.registrationOptions(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register/verify')
  async registerVerify(@Request() req, @Body() body: { credential: any; challenge?: string }) {
    await this.webauthnService.verifyRegistration(req.user.sub, body.credential);
    return { verified: true };
  }

  @Post('authenticate/options')
  authOptions(@Body() _body: { email?: string }) {
    // Userless/discoverable — the email field is accepted for compat but unused.
    return this.webauthnService.authenticationOptions();
  }

  @Post('authenticate/verify')
  async authVerify(
    @Request() req,
    @Body() body: { email?: string; credential: any; challenge?: string },
  ) {
    const userId = await this.webauthnService.verifyAuthentication(body.credential);
    return this.webauthnService.issueTokens(userId, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async passkeyStatus(@Request() req) {
    const creds = await this.webauthnService.listCredentials(req.user.sub);
    return { hasPasskey: creds.length > 0 };
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  deletePasskey(@Request() req) {
    return this.webauthnService.removeAllCredentials(req.user.sub);
  }
}
