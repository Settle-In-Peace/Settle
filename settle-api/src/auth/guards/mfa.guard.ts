import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Requires an MFA-authenticated session (amr includes 'passkey'/'mfa').
 * Applied to consumer-report-data surfaces — MFSN API License §5.5.1
 * requires multi-factor for administrative access to credit data.
 * Password-only sessions (amr: ['pwd']) are rejected with 403.
 */
@Injectable()
export class MfaGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    const amr: string[] = user?.amr || [];
    if (amr.includes('passkey') || amr.includes('mfa')) return true;
    throw new ForbiddenException(
      'This action requires a passkey-authenticated session. Sign in with a passkey or register one in Settings.',
    );
  }
}
