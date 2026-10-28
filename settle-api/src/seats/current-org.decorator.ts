import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrgContext } from './org-role.guard';

/** Injects req.orgContext populated by OrgRoleGuard. */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.orgContext;
  },
);
