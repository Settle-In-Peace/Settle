import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindManyOptions } from 'typeorm';
import { Match } from '../entities/match.entity';
import { Lead } from '../entities/lead.entity';
import { Provider } from '../entities/provider.entity';
import { EmailService } from '../email/email.service';

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export type ProviderTier = 'premium' | 'standard' | 'basic';
export type LeadTier = 'premium' | 'standard' | 'basic';

export type ProviderWithMatch = Partial<Provider> & {
  id: string;
  matchScore: number;
  matchReasons: string[];
  matchId?: string;
  providerTier?: ProviderTier;
};

export type LeadWithMatch = Partial<Lead> & {
  id: string;
  matchScore: number;
  matchReasons: string[];
  matchId?: string;
  leadTier?: LeadTier;
};

export interface AutoMatchResult {
  matched: boolean;
  match?: Match;
  provider?: Partial<Provider>;
  leadId: string;
  threshold: number;
  topScore: number;
  reason: string;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  /** Minimum score required for auto-assignment. Override with AUTO_MATCH_THRESHOLD env. */
  private readonly autoMatchThreshold = Number(process.env.AUTO_MATCH_THRESHOLD) || 70;

  constructor(
    @InjectRepository(Match)
    private matchesRepository: Repository<Match>,
    @InjectRepository(Lead)
    private leadsRepository: Repository<Lead>,
    @InjectRepository(Provider)
    private providersRepository: Repository<Provider>,
    private emailService: EmailService,
  ) {}

  /**
   * Derive a provider's quality tier from reputation + membership signals.
   *  - premium:  AFCC member with strong ratings, or a marketplace seat
   *  - standard: solid ratings or IAPDA member
   *  - basic:    everyone else
   */
  getProviderTier(provider: Partial<Provider>): ProviderTier {
    const rating = Number(provider.avgRating) || 0;
    const seat = provider.subscriptionType === 'marketplace_seat';
    if (seat || (provider.isAfccMember && rating >= 4.5)) return 'premium';
    if (rating >= 4.0 || provider.isAfccMember || provider.isIapdaMember) return 'standard';
    return 'basic';
  }

  /**
   * Derive a lead's quality tier from ML tier / rule-based quality score.
   *  - premium: mlTier === 'premium' or qualityScore >= 70
   *  - standard: mlTier === 'standard' or qualityScore >= 40
   *  - basic:    otherwise
   */
  getLeadTier(lead: Partial<Lead>): LeadTier {
    if (lead.mlTier === 'premium' || (lead.mlTier == null && lead.qualityScore != null && lead.qualityScore >= 70)) {
      return 'premium';
    }
    if (lead.mlTier === 'standard' || (lead.mlTier == null && lead.qualityScore != null && lead.qualityScore >= 40)) {
      return 'standard';
    }
    return 'basic';
  }

  /**
   * Send an email notification to a provider when a new high-quality match is created.
   * Only sends once per match (tracked by emailSentAt).
   */
  private async maybeNotifyProvider(match: Match, provider: Provider, lead: Lead): Promise<void> {
    if (match.emailSentAt) return;
    if (match.matchScore < 70) return;
    if (!provider.emailVerified) return;
    if (provider.status !== 'active' && provider.status !== 'approved') return;

    try {
      const sent = await this.emailService.sendLeadMatchNotification(provider, lead, match);
      if (sent) {
        match.emailSentAt = new Date();
        await this.matchesRepository.save(match);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send lead match notification for match ${match.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Core matching algorithm. Scores a lead against a provider (0-100).
   *
   *  - State match (25 pts): lead.state in provider.statesServed[]
   *  - Debt type match (25 pts): overlap between lead.debtTypes[] and provider.debtTypes[]
   *  - Debt amount in range (20 pts): lead.totalDebt within [minDebtAmount, maxDebtAmount]
   *  - Service type match (15 pts): provider offers debt_settlement
   *  - Provider quality bonus (15 pts): based on avgRating, bbbRating, isAfccMember
   *  - Tier alignment bonus (up to 10 pts): premium providers get premium leads first
   */
  scoreMatch(lead: Partial<Lead>, provider: Partial<Provider>): ScoreResult {
    let score = 0;
    const reasons: string[] = [];

    // 1. State match (25)
    if (provider.statesServed && provider.statesServed.length > 0) {
      if (lead.state && provider.statesServed.includes(lead.state)) {
        score += 25;
        reasons.push('state_match');
      }
    } else {
      // Provider serves all states (empty array treated as nationwide)
      if (lead.state) {
        score += 25;
        reasons.push('state_match_nationwide');
      }
    }

    // 2. Debt type match (25)
    const leadDebtTypes = lead.debtTypes ?? [];
    const providerDebtTypes = provider.debtTypes ?? [];
    if (leadDebtTypes.length > 0 && providerDebtTypes.length > 0) {
      const overlap = leadDebtTypes.filter((t) => providerDebtTypes.includes(t));
      if (overlap.length > 0) {
        // Full match if all lead debt types are covered, partial otherwise
        const ratio = overlap.length / leadDebtTypes.length;
        score += Math.round(25 * ratio);
        reasons.push('debt_type_match');
      }
    } else if (providerDebtTypes.length === 0) {
      // Provider accepts all debt types
      if (leadDebtTypes.length > 0) {
        score += 25;
        reasons.push('debt_type_match_all');
      }
    }

    // 3. Debt amount in range (20)
    const totalDebt = Number(lead.totalDebt) || 0;
    const minDebt = Number(provider.minDebtAmount) || 0;
    const maxDebt = provider.maxDebtAmount ? Number(provider.maxDebtAmount) : null;
    if (totalDebt >= minDebt && (maxDebt === null || totalDebt <= maxDebt)) {
      score += 20;
      reasons.push('debt_amount_in_range');
    } else if (totalDebt >= minDebt * 0.8 && maxDebt !== null && totalDebt <= maxDebt * 1.2) {
      // Near-range partial credit
      score += 10;
      reasons.push('debt_amount_near_range');
    }

    // 4. Service type match (15)
    const providerServiceTypes = provider.serviceTypes ?? [];
    if (providerServiceTypes.includes('debt_settlement')) {
      score += 15;
      reasons.push('service_type_debt_settlement');
    } else if (providerServiceTypes.length > 0) {
      // Partial credit for any relevant service
      score += 5;
      reasons.push('service_type_partial');
    }

    // 5. Provider quality bonus (15)
    let qualityBonus = 0;
    if (provider.avgRating) {
      const rating = Number(provider.avgRating) || 0;
      // 5 stars -> 7 pts, scaled
      qualityBonus += Math.round((rating / 5) * 7);
    }
    if (provider.bbbRating) {
      const bbb = provider.bbbRating.toUpperCase();
      if (bbb.startsWith('A')) qualityBonus += 4;
      else if (bbb.toUpperCase() === 'B' || bbb.startsWith('B')) qualityBonus += 2;
    }
    if (provider.isAfccMember) {
      qualityBonus += 4;
    }
    qualityBonus = Math.min(qualityBonus, 15);
    if (qualityBonus > 0) {
      score += qualityBonus;
      reasons.push('provider_quality_bonus');
    }

    // 6. Tier alignment bonus (10) — premium providers get premium leads first.
    // Exact tier match gets full bonus; adjacent tiers get partial credit so
    // premium providers still rank above standard ones for standard leads.
    const providerTier = this.getProviderTier(provider);
    const leadTier = this.getLeadTier(lead);
    const tierRank: Record<string, number> = { premium: 3, standard: 2, basic: 1 };
    const tierDiff = Math.abs(tierRank[providerTier] - tierRank[leadTier]);
    if (tierDiff === 0) {
      score += 10;
      reasons.push(`tier_alignment_${leadTier}`);
    } else if (tierDiff === 1) {
      score += 5;
      reasons.push('tier_alignment_partial');
    }

    score = Math.min(score, 100);
    return { score, reasons };
  }

  /**
   * Find all active providers that match a lead, create/update Match records,
   * and return them sorted by score descending.
   */
  async findMatchesForLead(leadId: string): Promise<Match[]> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const providers = await this.providersRepository.find({
      where: { status: 'active', isAcceptingLeads: true },
    });

    const matches: Match[] = [];
    for (const provider of providers) {
      const { score, reasons } = this.scoreMatch(lead, provider);
      if (score <= 0) continue;

      // Upsert match record (unique on leadId + providerId)
      let match = await this.matchesRepository.findOne({
        where: { leadId, providerId: provider.id },
      });
      if (match) {
        match.matchScore = score;
        match.matchReasons = reasons;
        match = await this.matchesRepository.save(match);
      } else {
        match = this.matchesRepository.create({
          leadId,
          providerId: provider.id,
          matchScore: score,
          matchReasons: reasons,
          status: 'suggested',
        });
        match = await this.matchesRepository.save(match);
        await this.maybeNotifyProvider(match, provider, lead);
      }
      matches.push(match);
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches;
  }

  /**
   * Find all available leads that match a provider's criteria, create/update
   * Match records, and return them sorted by score descending.
   */
  async findMatchesForProvider(providerId: string): Promise<Match[]> {
    const provider = await this.providersRepository.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    const leads = await this.leadsRepository.find({
      where: { status: In(['available', 'new']) },
    });

    const matches: Match[] = [];
    for (const lead of leads) {
      const { score, reasons } = this.scoreMatch(lead, provider);
      if (score <= 0) continue;

      let match = await this.matchesRepository.findOne({
        where: { leadId: lead.id, providerId },
      });
      if (match) {
        match.matchScore = score;
        match.matchReasons = reasons;
        match = await this.matchesRepository.save(match);
      } else {
        match = this.matchesRepository.create({
          leadId: lead.id,
          providerId,
          matchScore: score,
          matchReasons: reasons,
          status: 'suggested',
        });
        match = await this.matchesRepository.save(match);
        await this.maybeNotifyProvider(match, provider, lead);
      }
      matches.push(match);
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches;
  }

  /**
   * For consumers: returns matched providers with scores (public-facing).
   * Excludes sensitive provider fields (password, stripeCustomerId, etc.).
   */
  async getRecommendedProviders(leadId: string): Promise<ProviderWithMatch[]> {
    const matches = await this.findMatchesForLead(leadId);

    const providerIds = matches.map((m) => m.providerId);
    if (providerIds.length === 0) return [];

    const providers = await this.providersRepository.find({
      where: { id: In(providerIds) },
    });

    const providerMap = new Map(providers.map((p) => [p.id, p]));
    const result: ProviderWithMatch[] = [];
    for (const match of matches) {
      const provider = providerMap.get(match.providerId);
      if (!provider) continue;
      const {
        password: _pw,
        stripeCustomerId: _sc,
        stripeSubscriptionId: _ss,
        subscriptionStatus: _sst,
        subscriptionTier: _st,
        subscriptionSeats: _sse,
        currentPeriodEnd: _cpe,
        cancelAtPeriodEnd: _cape,
        creditBalance: _cb,
        leadPrice: _lp,
        subscriptionType: _sbt,
        emailVerified: _ev,
        passwordSetupToken: _pst,
        passwordSetupExpires: _pse,
        planInterest: _pi,
        ...safe
      } = provider;
      result.push({
        ...safe,
        matchId: match.id,
        matchScore: match.matchScore,
        matchReasons: match.matchReasons ?? [],
        providerTier: this.getProviderTier(provider),
      });
    }
    return result;
  }

  /**
   * For providers: returns matched leads with scores. Sensitive consumer
   * contact info (phone, email) is masked unless the lead was purchased by
   * this provider.
   */
  async getMatchedLeadsForProvider(providerId: string): Promise<LeadWithMatch[]> {
    const matches = await this.findMatchesForProvider(providerId);

    const leadIds = matches.map((m) => m.leadId);
    if (leadIds.length === 0) return [];

    const leads = await this.leadsRepository.find({ where: { id: In(leadIds) } });
    const leadMap = new Map(leads.map((l) => [l.id, l]));

    const result: LeadWithMatch[] = [];
    for (const match of matches) {
      const lead = leadMap.get(match.leadId);
      if (!lead) continue;

      const purchased = lead.purchasedBy === providerId;
      const safe: Partial<Lead> = { ...lead };
      if (!purchased) {
        safe.phone = this.maskValue(lead.phone);
        safe.email = this.maskEmail(lead.email);
        safe.lastName = this.maskValue(lead.lastName);
      }

      const { ...rest } = safe;
      result.push({
        ...rest,
        id: lead.id,
        matchScore: match.matchScore,
        matchReasons: match.matchReasons ?? [],
      } as LeadWithMatch);
    }
    return result;
  }

  /**
   * Consumer requests contact from a specific provider. Sets match status to
   * 'requested' and records the timestamp.
   */
  async requestContact(leadId: string, providerId: string): Promise<Match> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const provider = await this.providersRepository.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.status !== 'active' || !provider.isAcceptingLeads) {
      throw new BadRequestException('Provider is not currently accepting leads');
    }

    let match = await this.matchesRepository.findOne({ where: { leadId, providerId } });
    if (match) {
      if (match.status === 'declined') {
        throw new BadRequestException('This match has been declined');
      }
      match.status = 'requested';
      match.requestedAt = new Date();
      match = await this.matchesRepository.save(match);
    } else {
      const { score, reasons } = this.scoreMatch(lead, provider);
      match = this.matchesRepository.create({
        leadId,
        providerId,
        matchScore: score,
        matchReasons: reasons,
        status: 'requested',
        requestedAt: new Date(),
      });
      match = await this.matchesRepository.save(match);
    }
    return match;
  }

  /**
   * Provider or consumer declines a match. Sets status to 'declined'.
   * The caller's userId is verified against the match's providerId (for
   * providers) or the lead's userId (for consumers) to ensure only an
   * authorized party can decline a match.
   */
  async declineMatch(
    matchId: string,
    userType: 'provider' | 'consumer',
    userId: string,
  ): Promise<Match> {
    const match = await this.matchesRepository.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status === 'purchased') {
      throw new BadRequestException('Cannot decline a purchased match');
    }

    // Verify the caller is authorized to decline this match.
    if (userType === 'provider') {
      if (match.providerId !== userId) {
        throw new ForbiddenException('You are not authorized to decline this match');
      }
    } else {
      // Consumer: verify they own the lead associated with this match.
      const lead = await this.leadsRepository.findOne({ where: { id: match.leadId } });
      if (!lead || lead.userId !== userId) {
        throw new ForbiddenException('You are not authorized to decline this match');
      }
    }

    match.status = 'declined';
    match.declinedAt = new Date();
    return this.matchesRepository.save(match);
  }

  /**
   * Provider's match history (all statuses).
   */
  async getMatchHistory(providerId: string): Promise<Match[]> {
    return this.matchesRepository.find({
      where: { providerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Admin stats: total matches, requested, purchased, conversion rate.
   */
  async getMatchStats(): Promise<{
    total: number;
    suggested: number;
    viewed: number;
    requested: number;
    declined: number;
    purchased: number;
    expired: number;
    conversionRate: number;
  }> {
    const total = await this.matchesRepository.count();
    const suggested = await this.matchesRepository.count({ where: { status: 'suggested' } });
    const viewed = await this.matchesRepository.count({ where: { status: 'viewed' } });
    const requested = await this.matchesRepository.count({ where: { status: 'requested' } });
    const declined = await this.matchesRepository.count({ where: { status: 'declined' } });
    const purchased = await this.matchesRepository.count({ where: { status: 'purchased' } });
    const expired = await this.matchesRepository.count({ where: { status: 'expired' } });

    const conversionRate = total > 0 ? Number(((purchased / total) * 100).toFixed(2)) : 0;

    return { total, suggested, viewed, requested, declined, purchased, expired, conversionRate };
  }

  /**
   * Admin: all matches with pagination.
   */
  async getAllMatches(page = 1, limit = 20): Promise<{ data: Match[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const options: FindManyOptions<Match> = {
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    };
    const [data, total] = await this.matchesRepository.findAndCount(options);
    return { data, total, page, limit };
  }

  // --- helpers ---

  private maskValue(value: string | undefined): string {
    if (!value) return '';
    if (value.length <= 2) return '**';
    return value.slice(0, 1) + '*'.repeat(Math.max(value.length - 2, 1)) + value.slice(-1);
  }

  private maskEmail(email: string | undefined): string {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return this.maskValue(email);
    const maskedLocal = local.length <= 2 ? '**' : local.slice(0, 2) + '*'.repeat(Math.max(local.length - 2, 1));
    return `${maskedLocal}@${domain}`;
  }
}
