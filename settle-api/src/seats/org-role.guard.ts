import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrgMember, OrgMemberStatus, OrgRole } from './org-member.entity';

export const ORG_ROLES_KEY = 'orgRoles';

/** Restrict a route to specific org roles, e.g. @OrgRoles('org_owner','org_manager'). */
export const OrgRoles = (...roles: OrgRole[]) => SetMetadata(ORG_ROLES_KEY, roles);

export interface OrgContext {
  orgId: string;
  orgRole: OrgRole;
  memberId?: string;
}

/**
 * OrgRoleGuard — resolves the caller's org membership and enforces
 * @OrgRoles(...) restrictions. Must run AFTER JwtAuthGuard.
 *
 * Attaches `req.orgContext = { orgId, orgRole, memberId }` for handlers.
 * Platform admins without a membership may act inside an org by passing
 * `?orgId=` or the `x-org-id` header (they resolve as org_owner).
 */
@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(OrgMember)
    private readonly membersRepository: Repository<OrgMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.sub) {
      throw new ForbiddenException('Authentication required');
    }

    const membership = await this.membersRepository.findOne({
      where: { userId: user.sub, status: OrgMemberStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });

    let orgId = membership?.orgId;
    let orgRole = membership?.orgRole;

    if (!membership && user.role === 'admin') {
      const headerOrg = req.headers?.['x-org-id'];
      const queryOrg = req.query?.orgId;
      orgId = (Array.isArray(headerOrg) ? headerOrg[0] : headerOrg) || queryOrg;
      orgRole = OrgRole.ORG_OWNER;
    }

    if (!orgId || !orgRole) {
      throw new ForbiddenException(
        'No active organization membership — ask your org admin for a seat.',
      );
    }

    req.orgContext = { orgId, orgRole, memberId: membership?.id } as OrgContext;

    const required = this.reflector.getAllAndOverride<OrgRole[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.includes(orgRole) && user.role !== 'admin') {
      throw new ForbiddenException(
        `Requires org role: ${required.join(' or ')}`,
      );
    }
    return true;
  }
}
