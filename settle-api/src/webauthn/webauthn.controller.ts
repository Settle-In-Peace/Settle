import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebAuthnService } from './webauthn.service';

interface AuthenticatedRequest {
  user?: { sub?: string; id?: string; email?: string };
  ip?: string;
  headers?: Record<string, string>;
}

/** Passkeys — registration (JWT) + userless authentication (public). */
@Controller('webauthn')
export class WebAuthnController {
  constructor(private readonly webauthn: WebAuthnService) {}

  /** POST /webauthn/register/options — begin passkey enrollment. */
  @Post('register/options')
  @UseGuards(JwtAuthGuard)
  registerOptions(@Req() req: AuthenticatedRequest) {
    return this.webauthn.registrationOptions(req.user?.sub ?? req.user?.id!);
  }

  /** POST /webauthn/register/verify — finish enrollment, store credential. */
  @Post('register/verify')
  @UseGuards(JwtAuthGuard)
  verifyRegistration(
    @Req() req: AuthenticatedRequest,
    @Body() body: { response: any; deviceName?: string },
  ) {
    return this.webauthn.verifyRegistration(
      req.user?.sub ?? req.user?.id!,
      body.response,
      body.deviceName,
    );
  }

  /** POST /webauthn/login/options — public; starts a userless passkey sign-in. */
  @Post('login/options')
  loginOptions() {
    return this.webauthn.authenticationOptions();
  }

  /** POST /webauthn/login/verify — public; resolves credential → issues JWT pair. */
  @Post('login/verify')
  async verifyLogin(
    @Body() body: { response: any },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = await this.webauthn.verifyAuthentication(body.response);
    return this.webauthn.issueTokens(userId, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  /** GET /webauthn/credentials — list the caller's passkeys. */
  @Get('credentials')
  @UseGuards(JwtAuthGuard)
  list(@Req() req: AuthenticatedRequest) {
    return this.webauthn.listCredentials(req.user?.sub ?? req.user?.id!);
  }

  /** DELETE /webauthn/credentials/:id — revoke a passkey. */
  @Delete('credentials/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.webauthn.removeCredential(req.user?.sub ?? req.user?.id!, id);
  }
}
