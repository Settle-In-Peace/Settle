import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Org, OrgStatus } from './org.entity';
import { OrgMember, OrgMemberStatus, OrgRole } from './org-member.entity';
import { Seat, SeatStatus, SeatTier } from './seat.entity';
import { SeatUsage } from './seat-usage.entity';
import { SeatPlan } from './seat-plan.entity';
import { User } from '../entities/user.entity';
import { DialerCall } from '../dialer/dialer-call.entity';
import { OrgContext } from './org-role.guard';
import {
  AssignSeatDto,
  CreateOrgDto,
  InviteMemberDto,
  SeatCheckoutDto,
  UpdateMemberDto,
  UpdateOrgDto,
  UpdateSeatDto,
} from './dto/seats.dto';
import { StripeService } from '../stripe/stripe.service';

/** Dispositions that count as right-party-contact (RPC) for usage rollups. */
const RPC_DISPOSITIONS = ['rpc', 'promise_to_pay', 'settlement', 'negotiation'];

export interface SeatView {
  id: string;
  orgId: string;
  userId: string;
  seatTier: SeatTier;
  monthlyMinutesIncluded: number;
  status: SeatStatus;
  assignedAt?: Date;
  user?: { id: string; email: string; firstName?: string; lastName?: string };
}

@Injectable()
export class SeatsService {
  private readonly logger = new Logger(SeatsService.name);

  constructor(
    @InjectRepository(Org) private readonly orgsRepo: Repository<Org>,
    @InjectRepository(OrgMember) private readonly membersRepo: Repository<OrgMember>,
    @InjectRepository(Seat) private readonly seatsRepo: Repository<Seat>,
    @InjectRepository(SeatUsage) private readonly usageRepo: Repository<SeatUsage>,
    @InjectRepository(SeatPlan) private readonly plansRepo: Repository<SeatPlan>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(DialerCall) private readonly callsRepo: Repository<DialerCall>,
    private readonly stripeService: StripeService,
  ) {}

  private currentPeriod(at: Date = new Date()): string {
    return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private async usersById(ids: string[]): Promise<Map<string, User>> {
    if (!ids.length) return new Map();
    const users = await this.usersRepo.find({ where: { id: In(ids) } });
    return new Map(users.map((u) => [u.id, u]));
  }

  private userView(u?: User) {
    return u
      ? { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName }
      : undefined;
  }

  // ── Plans ──────────────────────────────────────────────────────────────

  listPlans() {
    return this.plansRepo.find({ where: { active: true }, order: { priceCents: 'ASC' } });
  }

  // ── Org lifecycle ──────────────────────────────────────────────────────

  async createOrg(userId: string, dto: CreateOrgDto, isAdmin = false): Promise<Org> {
    const existing = await this.membersRepo.findOne({
      where: { userId, status: OrgMemberStatus.ACTIVE },
    });
    if (existing && !isAdmin) {
      throw new BadRequestException(
        'You already belong to an organization — leave it before creating a new one.',
      );
    }
    const org = await this.orgsRepo.save(
      this.orgsRepo.create({
        name: dto.name.trim(),
        billingEmail: dto.billingEmail,
        ownerUserId: userId,
        status: OrgStatus.ACTIVE,
      }),
    );
    await this.membersRepo.save(
      this.membersRepo.create({
        orgId: org.id,
        userId,
        orgRole: OrgRole.ORG_OWNER,
        status: OrgMemberStatus.ACTIVE,
        invitedBy: userId,
      }),
    );
    this.logger.log(`Org ${org.id} "${org.name}" created by user ${userId}`);
    return org;
  }

  /** Org profile + seat/usage summary for the member dashboard. */
  async getMyOrg(ctx: OrgContext) {
    const org = await this.orgsRepo.findOne({ where: { id: ctx.orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const [seats, members, plan] = await Promise.all([
      this.seatsRepo.find({ where: { orgId: org.id } }),
      this.membersRepo.find({ where: { orgId: org.id } }),
      org.planCode
        ? this.plansRepo.findOne({ where: { code: org.planCode } })
        : Promise.resolve(null),
    ]);
    const seatsUsed = seats.filter((s) => s.status === SeatStatus.ACTIVE).length;
    const activeMembers = members.filter((m) => m.status === OrgMemberStatus.ACTIVE);
    const usage = await this.syncUsage(org.id, this.currentPeriod());

    return {
      org,
      plan,
      myRole: ctx.orgRole,
      seatsPurchased: org.seatsPurchased,
      seatsUsed,
      seatsAvailable: Math.max(0, org.seatsPurchased - seatsUsed),
      memberCount: activeMembers.length,
      usage,
    };
  }

  async updateMyOrg(ctx: OrgContext, dto: UpdateOrgDto): Promise<Org> {
    const org = await this.orgsRepo.findOne({ where: { id: ctx.orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    // Members may only update display fields — plan/seat counts change via
    // billing (or platform admin below).
    if (dto.name) org.name = dto.name.trim();
    if (dto.billingEmail !== undefined) org.billingEmail = dto.billingEmail;
    if (dto.skiptraceKey !== undefined) org.skiptraceKey = dto.skiptraceKey || null;
    return this.orgsRepo.save(org);
  }

  // ── Members ────────────────────────────────────────────────────────────

  async listMembers(ctx: OrgContext) {
    const members = await this.membersRepo.find({
      where: { orgId: ctx.orgId },
      order: { createdAt: 'ASC' },
    });
    const users = await this.usersById(members.map((m) => m.userId));
    return members.map((m) => ({ ...m, user: this.userView(users.get(m.userId)) }));
  }

  async addMember(ctx: OrgContext, dto: InviteMemberDto, inviterId: string) {
    let userId = dto.userId;
    if (!userId && dto.email) {
      const user = await this.usersRepo.findOne({ where: { email: dto.email } });
      if (!user) {
        throw new NotFoundException(
          `No user account for ${dto.email} — the agent must register first.`,
        );
      }
      userId = user.id;
    }
    if (!userId) throw new BadRequestException('Provide userId or email');

    const otherOrg = await this.membersRepo.findOne({
      where: { userId, status: OrgMemberStatus.ACTIVE },
    });
    if (otherOrg && otherOrg.orgId !== ctx.orgId) {
      throw new BadRequestException('That user already belongs to another organization.');
    }

    const existing = await this.membersRepo.findOne({
      where: { orgId: ctx.orgId, userId },
    });
    if (existing) {
      existing.status = OrgMemberStatus.ACTIVE;
      if (dto.orgRole) existing.orgRole = dto.orgRole;
      return this.membersRepo.save(existing);
    }
    return this.membersRepo.save(
      this.membersRepo.create({
        orgId: ctx.orgId,
        userId,
        orgRole: dto.orgRole ?? OrgRole.AGENT,
        status: OrgMemberStatus.ACTIVE,
        invitedBy: inviterId,
      }),
    );
  }

  async updateMember(ctx: OrgContext, memberId: string, dto: UpdateMemberDto) {
    const member = await this.membersRepo.findOne({
      where: { id: memberId, orgId: ctx.orgId },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (dto.orgRole) member.orgRole = dto.orgRole;
    if (dto.status) member.status = dto.status as OrgMemberStatus;
    // Suspending a member also suspends their active seat.
    if (dto.status === OrgMemberStatus.SUSPENDED) {
      await this.seatsRepo.update(
        { orgId: ctx.orgId, userId: member.userId, status: SeatStatus.ACTIVE },
        { status: SeatStatus.SUSPENDED },
      );
    }
    return this.membersRepo.save(member);
  }

  // ── Seats ──────────────────────────────────────────────────────────────

  async listSeats(ctx: OrgContext): Promise<SeatView[]> {
    const seats = await this.seatsRepo.find({
      where: { orgId: ctx.orgId },
      order: { createdAt: 'ASC' },
    });
    const users = await this.usersById(seats.map((s) => s.userId));
    return seats.map((s) => ({ ...s, user: this.userView(users.get(s.userId)) }));
  }

  async assignSeat(ctx: OrgContext, dto: AssignSeatDto, assignedBy: string): Promise<Seat> {
    const org = await this.orgsRepo.findOne({ where: { id: ctx.orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    // Make sure the assignee is an org member (auto-enroll as agent).
    const membership = await this.membersRepo.findOne({
      where: { orgId: ctx.orgId, userId: dto.userId },
    });
    if (!membership) {
      await this.addMember(ctx, { userId: dto.userId, orgRole: OrgRole.AGENT }, assignedBy);
    } else if (membership.status !== OrgMemberStatus.ACTIVE) {
      throw new BadRequestException('That member is not active — reactivate them first.');
    }

    const existing = await this.seatsRepo.findOne({
      where: { orgId: ctx.orgId, userId: dto.userId },
    });
    if (existing && existing.status === SeatStatus.ACTIVE) {
      throw new BadRequestException('That member already has an active seat.');
    }

    const tier = dto.seatTier ?? SeatTier.STARTER;
    const plan = await this.plansRepo.findOne({ where: { code: tier, active: true } });

    // Seat-limit enforcement: active seats cannot exceed seats_purchased.
    // (Reactivating a previously released seat still counts against this.)
    const activeCount = await this.seatsRepo.count({
      where: { orgId: ctx.orgId, status: SeatStatus.ACTIVE },
    });
    if (activeCount >= org.seatsPurchased) {
      throw new ForbiddenException(
        `All ${org.seatsPurchased} purchased seats are in use — buy more seats or release one first.`,
      );
    }

    if (existing) {
      existing.status = SeatStatus.ACTIVE;
      existing.seatTier = tier;
      existing.monthlyMinutesIncluded = plan?.includedMinutes ?? 0;
      existing.assignedBy = assignedBy;
      existing.assignedAt = new Date();
      existing.releasedAt = undefined;
      return this.seatsRepo.save(existing);
    }

    return this.seatsRepo.save(
      this.seatsRepo.create({
        orgId: ctx.orgId,
        userId: dto.userId,
        seatTier: tier,
        monthlyMinutesIncluded: plan?.includedMinutes ?? 0,
        status: SeatStatus.ACTIVE,
        assignedBy,
        assignedAt: new Date(),
      }),
    );
  }

  async updateSeat(ctx: OrgContext, seatId: string, dto: UpdateSeatDto): Promise<Seat> {
    const seat = await this.seatsRepo.findOne({
      where: { id: seatId, orgId: ctx.orgId },
    });
    if (!seat) throw new NotFoundException('Seat not found');
    if (seat.status === SeatStatus.RELEASED) {
      throw new BadRequestException('Released seats cannot be modified — assign a new seat.');
    }
    if (dto.seatTier) {
      seat.seatTier = dto.seatTier;
      const plan = await this.plansRepo.findOne({ where: { code: dto.seatTier } });
      seat.monthlyMinutesIncluded = plan?.includedMinutes ?? seat.monthlyMinutesIncluded;
    }
    if (dto.status === SeatStatus.ACTIVE && seat.status === SeatStatus.SUSPENDED) {
      // Reactivation counts against the purchased-seat limit, same as a fresh assign.
      const org = await this.orgsRepo.findOne({ where: { id: ctx.orgId } });
      const activeCount = await this.seatsRepo.count({
        where: { orgId: ctx.orgId, status: SeatStatus.ACTIVE },
      });
      if (org && activeCount >= org.seatsPurchased) {
        throw new ForbiddenException(
          `All ${org.seatsPurchased} purchased seats are in use — buy more seats or release one first.`,
        );
      }
    }
    if (dto.status) seat.status = dto.status;
    return this.seatsRepo.save(seat);
  }

  async releaseSeat(ctx: OrgContext, seatId: string): Promise<Seat> {
    const seat = await this.seatsRepo.findOne({
      where: { id: seatId, orgId: ctx.orgId },
    });
    if (!seat) throw new NotFoundException('Seat not found');
    seat.status = SeatStatus.RELEASED;
    seat.releasedAt = new Date();
    return this.seatsRepo.save(seat);
  }

  // ── Usage metering ─────────────────────────────────────────────────────

  /**
   * Roll up dialer_calls per seat for a billing period ('YYYY-MM') and
   * persist the result in seat_usage. Called on reads so the table is
   * always fresh within a request — cheap enough at dashboard scale.
   * Overage is tracked for invoicing, never hard-blocked.
   */
  async syncUsage(orgId: string, period: string): Promise<SeatUsage[]> {
    const seats = await this.seatsRepo.find({
      where: { orgId, status: In([SeatStatus.ACTIVE, SeatStatus.SUSPENDED]) },
    });
    if (!seats.length) return [];

    const agentIds = seats.map((s) => s.userId);
    const rows: { agentId: string; calls: string; seconds: string; rpc: string }[] =
      await this.callsRepo
        .createQueryBuilder('c')
        .select('c.agent_id', 'agentId')
        .addSelect('COUNT(*)', 'calls')
        .addSelect('COALESCE(SUM(c.duration), 0)', 'seconds')
        .addSelect(
          `COUNT(*) FILTER (WHERE c.answered_at IS NOT NULL OR c.disposition IN ('${RPC_DISPOSITIONS.join("','")}'))`,
          'rpc',
        )
        .where('c.agent_id IN (:...agentIds)')
        .andWhere(`to_char(c.created_at, 'YYYY-MM') = :period`)
        .groupBy('c.agent_id')
        .setParameters({ agentIds, period })
        .getRawMany();

    const byAgent = new Map(rows.map((r) => [r.agentId, r]));
    const now = new Date();
    const usage: SeatUsage[] = [];

    for (const seat of seats) {
      const r = byAgent.get(seat.userId);
      const callsPlaced = r ? parseInt(r.calls, 10) : 0;
      const seconds = r ? parseInt(r.seconds, 10) : 0;
      const minutesUsed = Math.ceil(seconds / 60);
      const rpcCount = r ? parseInt(r.rpc, 10) : 0;
      const included = seat.monthlyMinutesIncluded;
      const overageMinutes =
        included >= 0 ? Math.max(0, minutesUsed - included) : 0;

      let row = await this.usageRepo.findOne({
        where: { seatId: seat.id, period },
      });
      if (!row) {
        row = this.usageRepo.create({ seatId: seat.id, orgId, period });
      }
      row.minutesUsed = minutesUsed;
      row.callsPlaced = callsPlaced;
      row.rpcCount = rpcCount;
      row.overageMinutes = overageMinutes;
      row.lastSyncedAt = now;
      usage.push(await this.usageRepo.save(row));
    }
    return usage;
  }

  /** Per-seat usage for the org dashboard — joins seats + users + usage rows. */
  async getUsage(ctx: OrgContext, period?: string) {
    const p = period && /^\d{4}-\d{2}$/.test(period) ? period : this.currentPeriod();
    const usage = await this.syncUsage(ctx.orgId, p);
    const seats = await this.seatsRepo.find({ where: { orgId: ctx.orgId } });
    const users = await this.usersById(seats.map((s) => s.userId));
    const seatById = new Map(seats.map((s) => [s.id, s]));
    return {
      period: p,
      seats: usage.map((u) => {
        const seat = seatById.get(u.seatId);
        return {
          ...u,
          seatTier: seat?.seatTier,
          monthlyMinutesIncluded: seat?.monthlyMinutesIncluded,
          seatStatus: seat?.status,
          user: this.userView(users.get(seat?.userId ?? '')),
        };
      }),
      totals: {
        minutesUsed: usage.reduce((a, u) => a + u.minutesUsed, 0),
        callsPlaced: usage.reduce((a, u) => a + u.callsPlaced, 0),
        rpcCount: usage.reduce((a, u) => a + u.rpcCount, 0),
        overageMinutes: usage.reduce((a, u) => a + u.overageMinutes, 0),
      },
    };
  }

  // ── Billing ────────────────────────────────────────────────────────────

  async createSeatCheckout(ctx: OrgContext, dto: SeatCheckoutDto) {
    const org = await this.orgsRepo.findOne({ where: { id: ctx.orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const plan = await this.plansRepo.findOne({
      where: { code: dto.planCode, active: true },
    });
    if (!plan) throw new BadRequestException(`Unknown or inactive seat plan "${dto.planCode}"`);
    const session = await this.stripeService.createSeatCheckoutSession(
      org,
      plan,
      dto.seats,
      dto.returnUrl,
    );
    return { url: session.url, sessionId: session.id };
  }

  async createBillingPortal(ctx: OrgContext) {
    const org = await this.orgsRepo.findOne({ where: { id: ctx.orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const session = await this.stripeService.createOrgBillingPortalSession(org);
    return { url: session.url };
  }

  // ── Platform admin CRUD ────────────────────────────────────────────────

  async adminListOrgs() {
    const orgs = await this.orgsRepo.find({ order: { createdAt: 'DESC' }, take: 200 });
    const seatCounts = await this.seatsRepo
      .createQueryBuilder('s')
      .select('s.org_id', 'orgId')
      .addSelect(`COUNT(*) FILTER (WHERE s.status = 'active')`, 'active')
      .addSelect('COUNT(*)', 'total')
      .groupBy('s.org_id')
      .getRawMany<{ orgId: string; active: string; total: string }>();
    const countMap = new Map(seatCounts.map((r) => [r.orgId, r]));
    return orgs.map((o) => ({
      ...o,
      seatsUsed: parseInt(countMap.get(o.id)?.active ?? '0', 10),
    }));
  }

  async adminGetOrg(id: string) {
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    const [members, seats] = await Promise.all([
      this.membersRepo.find({ where: { orgId: id } }),
      this.seatsRepo.find({ where: { orgId: id } }),
    ]);
    const users = await this.usersById([
      ...members.map((m) => m.userId),
      ...seats.map((s) => s.userId),
    ]);
    return {
      org,
      members: members.map((m) => ({ ...m, user: this.userView(users.get(m.userId)) })),
      seats: seats.map((s) => ({ ...s, user: this.userView(users.get(s.userId)) })),
      usage: await this.syncUsage(id, this.currentPeriod()),
    };
  }

  async adminUpdateOrg(id: string, dto: UpdateOrgDto): Promise<Org> {
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    if (dto.name) org.name = dto.name.trim();
    if (dto.billingEmail !== undefined) org.billingEmail = dto.billingEmail;
    if (dto.skiptraceKey !== undefined) org.skiptraceKey = dto.skiptraceKey || null;
    if (dto.status) org.status = dto.status;
    if (dto.planCode !== undefined) org.planCode = dto.planCode;
    if (dto.seatsPurchased !== undefined) org.seatsPurchased = dto.seatsPurchased;
    return this.orgsRepo.save(org);
  }
}
