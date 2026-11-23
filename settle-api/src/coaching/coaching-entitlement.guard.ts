import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { CoachingService } from './coaching.service';

/**
 * Entitlement gate for consumer coaching features (budgets, goals,
 * calculators). Requires JwtAuthGuard to have run first so req.user.sub
 * is populated.
 *
 * Non-subscribers get 403 Forbidden with a stable `code`
 * (`COACHING_SUBSCRIPTION_REQUIRED`) and an `upgrade` payload — the web
 * paywall branches on `err.status === 403`, matching the codebase's
 * ForbiddenException guard convention (AdminGuard/SalesGuard et al).
 *
 * Staff/test accounts bypass via CoachingService.resolveEntitlement
 * (admin/sales roles + COACHING_GATE_EXEMPT_EMAILS allowlist — see that
 * method's docs). Never use the bypass for real consumers.
 */
@Injectable()
export class CoachingEntitlementGuard implements CanActivate {
  constructor(private coachingService: CoachingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const { entitled } = await this.coachingService.resolveEntitlement(userId);
    if (entitled) return true;

    throw new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        code: 'COACHING_SUBSCRIPTION_REQUIRED',
        error: 'coaching_subscription_required',
        message:
          'An active coaching subscription is required to use this feature.',
        upgrade: {
          url: '/coaching',
          plans: [
            { id: 'basic', priceMonthlyUsd: 19 },
            { id: 'pro', priceMonthlyUsd: 49 },
          ],
        },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
