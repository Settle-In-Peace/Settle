import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, In } from 'typeorm';
import { Provider } from '../entities/provider.entity';
import { Lead } from '../entities/lead.entity';
import { Match } from '../entities/match.entity';
import { User } from '../entities/user.entity';
import { EmailService } from '../email/email.service';
import { MatchingService } from '../matching/matching.service';
import { ProvidersService } from '../providers/providers.service';

type SafeProvider = Omit<Provider, 'password'>;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    @InjectRepository(Lead)
    private leadsRepository: Repository<Lead>,
    @InjectRepository(Match)
    private matchesRepository: Repository<Match>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private emailService: EmailService,
    private matchingService: MatchingService,
    private providersService: ProvidersService,
  ) {}

  /** List all providers regardless of status. */
  async getAllProviders(): Promise<SafeProvider[]> {
    const providers = await this.providersRepository.find({
      order: { createdAt: 'DESC' },
    });
    return providers.map(this.stripPassword);
  }

  /** List providers awaiting approval — both self-serve signups ('pending')
   *  and lightweight enrollments ('pending_review'). */
  async getPendingProviders(): Promise<SafeProvider[]> {
    const providers = await this.providersRepository.find({
      where: { status: In(['pending', 'pending_review']) },
      order: { createdAt: 'ASC' },
    });
    return providers.map(this.stripPassword);
  }

  /** Approve a provider - sets status to 'active' and sends approval email.
   *  Enrollees without a password get a one-time setup link in the email so
   *  they can activate portal access themselves. */
  async approveProvider(id: string): Promise<SafeProvider> {
    const provider = await this.findProviderOrFail(id);

    if (provider.status === 'active') {
      throw new BadRequestException('Provider is already active');
    }

    provider.status = 'active';
    provider.emailVerified = true;
    const saved = await this.providersRepository.save(provider);

    // Passwordless enrollees can't log in until they set a password —
    // issue a one-time setup token and link it in the approval email.
    let setupUrl: string | undefined;
    if (!saved.password) {
      try {
        const token = await this.providersService.createPasswordSetupToken(saved.id);
        const frontendUrl = process.env.FRONTEND_URL || 'https://settleinpeace.com';
        setupUrl = `${frontendUrl}/providers/set-password?token=${token}`;
      } catch (err) {
        this.logger.error(
          `Failed to issue password setup token for provider ${saved.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Fire-and-forget email - don't block the response on email delivery.
    this.emailService
      .sendProviderApprovalEmail(saved.email, saved.companyName, setupUrl)
      .then((ok) => {
        if (!ok) {
          this.logger.warn(`Approval email may not have been delivered to ${saved.email}`);
        }
      })
      .catch((err) =>
        this.logger.error(`Failed to send approval email: ${err instanceof Error ? err.message : String(err)}`),
      );

    this.logger.log(`Provider ${id} (${saved.companyName}) approved`);
    return this.stripPassword(saved);
  }

  /** Reject a provider - sets status to 'rejected' and sends rejection email. */
  async rejectProvider(id: string, reason?: string): Promise<SafeProvider> {
    const provider = await this.findProviderOrFail(id);

    provider.status = 'rejected';
    const saved = await this.providersRepository.save(provider);

    this.emailService
      .sendProviderRejectionEmail(saved.email, saved.companyName, reason)
      .then((ok) => {
        if (!ok) {
          this.logger.warn(`Rejection email may not have been delivered to ${saved.email}`);
        }
      })
      .catch((err) =>
        this.logger.error(`Failed to send rejection email: ${err instanceof Error ? err.message : String(err)}`),
      );

    this.logger.log(`Provider ${id} (${saved.companyName}) rejected`);
    return this.stripPassword(saved);
  }

  /** Suspend a provider - sets status to 'suspended'. */
  async suspendProvider(id: string): Promise<SafeProvider> {
    const provider = await this.findProviderOrFail(id);

    if (provider.status === 'suspended') {
      throw new BadRequestException('Provider is already suspended');
    }

    provider.status = 'suspended';
    const saved = await this.providersRepository.save(provider);

    this.logger.log(`Provider ${id} (${saved.companyName}) suspended`);
    return this.stripPassword(saved);
  }

  // --- lead & match admin endpoints ---

  /** Admin: list all leads with pagination (filter by status). */
  async getAllLeads(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const options: FindManyOptions<Lead> = {
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    };
    if (status) {
      options.where = { status };
    }
    const [data, total] = await this.leadsRepository.findAndCount(options);
    return { data, total, page, limit };
  }

  /** Admin: lead statistics (total, by status, by quality score range, conversion rate). */
  async getLeadStats() {
    const total = await this.leadsRepository.count();
    const byStatus: Record<string, number> = {};
    const statuses = ['new', 'available', 'sold', 'converted', 'rejected', 'expired'];
    for (const s of statuses) {
      byStatus[s] = await this.leadsRepository.count({ where: { status: s } });
    }

    const byQualityRange: Record<string, number> = {
      '0-25': await this.leadsRepository.createQueryBuilder('l').where('l.quality_score >= 0 AND l.quality_score < 25').getCount(),
      '25-50': await this.leadsRepository.createQueryBuilder('l').where('l.quality_score >= 25 AND l.quality_score < 50').getCount(),
      '50-75': await this.leadsRepository.createQueryBuilder('l').where('l.quality_score >= 50 AND l.quality_score < 75').getCount(),
      '75-100': await this.leadsRepository.createQueryBuilder('l').where('l.quality_score >= 75 AND l.quality_score <= 100').getCount(),
    };

    const sold = byStatus['sold'] || 0;
    const converted = byStatus['converted'] || 0;
    const conversionRate = total > 0 ? Number(((sold / total) * 100).toFixed(2)) : 0;
    const successRate = sold > 0 ? Number(((converted / sold) * 100).toFixed(2)) : 0;

    return { total, byStatus, byQualityRange, conversionRate, successRate };
  }

  /** Admin: manually assign a lead to a provider (optionally at a custom price). */
  async manualAssignLead(leadId: string, providerId: string, price?: number) {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const provider = await this.providersRepository.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    const salePrice = price ?? this.calculateLeadPrice(lead);

    await this.leadsRepository.update(leadId, {
      status: 'sold',
      purchasedBy: providerId,
      salePrice,
      purchasedAt: new Date(),
    });

    // Update any existing match record to 'purchased'
    const match = await this.matchesRepository.findOne({ where: { leadId, providerId } });
    if (match) {
      match.status = 'purchased';
      await this.matchesRepository.save(match);
    }

    // Notify the provider — a manual assignment is a lead delivery, so they
    // get the same contact-details email as a portal purchase. Fire-and-forget.
    this.emailService
      .sendLeadPurchaseConfirmation(provider, lead, salePrice)
      .catch((err) =>
        this.logger.error(
          `Failed to send lead-assignment email to provider ${providerId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    this.logger.log(`Lead ${leadId} manually assigned to provider ${providerId} at price ${salePrice}`);
    return this.leadsRepository.findOne({ where: { id: leadId } });
  }

  /** Admin: adjust a provider's credit balance (positive or negative amount). */
  async adjustProviderCredits(providerId: string, amount: number, reason?: string) {
    const provider = await this.findProviderOrFail(providerId);
    const newBalance = Number(provider.creditBalance) + amount;
    if (newBalance < 0) {
      throw new BadRequestException('Resulting credit balance cannot be negative');
    }
    await this.providersRepository.update(providerId, { creditBalance: newBalance });
    this.logger.log(`Adjusted credits for provider ${providerId} by ${amount} (reason: ${reason ?? 'n/a'})`);
    return this.stripPassword(await this.findProviderOrFail(providerId));
  }

  /** Admin: view all matches with pagination. */
  async getAllMatches(page = 1, limit = 20) {
    return this.matchingService.getAllMatches(page, limit);
  }

  // --- sales agents ---

  /** List users, optionally filtered by role. */
  async getUsers(role?: string) {
    const where: any = {};
    if (role) where.role = role;
    return this.usersRepository.find({
      where,
      order: { createdAt: 'DESC' },
      select: ['id', 'email', 'firstName', 'lastName', 'phone', 'role', 'createdAt'],
    });
  }

  /** Update any user (role, name, phone). */
  async updateUser(id: string, body: { firstName?: string; lastName?: string; phone?: string; role?: string }) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    Object.assign(user, body);
    const saved = await this.usersRepository.save(user);
    const { password: _, ...result } = saved;
    return result;
  }

  /** Delete a user. */
  async deleteUser(id: string) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.usersRepository.remove(user);
    return { success: true };
  }

  /** List all sales agents. */
  async getSalesAgents() {
    return this.usersRepository.find({
      where: { role: 'sales' },
      order: { createdAt: 'DESC' },
      select: ['id', 'email', 'firstName', 'lastName', 'phone', 'createdAt'],
    });
  }

  /** Create a sales agent user. */
  async createSalesAgent(body: { email: string; password: string; firstName?: string; lastName?: string; phone?: string }) {
    const existing = await this.usersRepository.findOne({ where: { email: body.email } });
    if (existing) throw new BadRequestException('Email already in use');

    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = this.usersRepository.create({
      email: body.email,
      password: passwordHash,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      role: 'sales',
      emailVerified: true,
    });
    const saved = await this.usersRepository.save(user);
    const { password: _, ...result } = saved;
    return result;
  }

  /** Assign a lead to a sales agent. */
  async assignLeadToSales(leadId: string, salesAgentId: string) {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    const agent = await this.usersRepository.findOne({ where: { id: salesAgentId, role: 'sales' } });
    if (!agent) throw new NotFoundException('Sales agent not found');

    await this.leadsRepository.update(leadId, {
      salesAgentId,
      salesAgentAssignedAt: new Date(),
      status: 'new',
    });
    this.logger.log(`Lead ${leadId} assigned to sales agent ${salesAgentId}`);
    return this.leadsRepository.findOne({ where: { id: leadId } });
  }

  // --- helpers ---

  private calculateLeadPrice(lead: Partial<Lead>): number {
    const debt = Number(lead.totalDebt) || 0;
    if (debt >= 50000) return 300;
    if (debt >= 25000) return 200;
    if (debt >= 15000) return 150;
    if (debt >= 10000) return 100;
    return 75;
  }

  private async findProviderOrFail(id: string): Promise<Provider> {
    const provider = await this.providersRepository.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  private stripPassword({ password: _, ...rest }: Provider): SafeProvider {
    return rest;
  }
}
