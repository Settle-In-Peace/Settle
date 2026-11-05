import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../entities/lead.entity';
import { ProvidersService } from '../providers/providers.service';
import { MatchingService } from '../matching/matching.service';
import { LeadScoringService } from '../ai/lead-scoring.service';
import { CrmService } from '../crm/crm.service';
import { CrmLeadSource } from '../entities/crm-lead.entity';
import { CrmDealStage, CrmDealStatus } from '../entities/crm-deal.entity';
import { EmailService } from '../email/email.service';
import { CloseFlowService } from '../close-flow/close-flow.service';
import { SETTLE_SITE } from '../close-flow/site.config';
import type { IntakeResult } from '../close-flow/close-flow.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(Lead)
    private leadsRepository: Repository<Lead>,
    private providersService: ProvidersService,
    private matchingService: MatchingService,
    private leadScoringService: LeadScoringService,
    private emailService: EmailService,
    private crmService: CrmService,
    private closeFlow: CloseFlowService,
  ) {}

  async submitAssessment(data: Partial<Lead>): Promise<Lead> {
    // TCPA consent is a hard legal requirement for debt-relief lead
    // distribution. We must NOT default or force it to true — the consumer
    // must have actively opted in, and we must preserve the audit metadata
    // (disclosure text, IP, user agent, page version, timestamp) that proves
    // what they agreed to. A lead without genuine consent cannot be sold or
    // contacted.
    if (!data.tcpaConsent) {
      throw new BadRequestException(
        'TCPA consent is required to submit an assessment. The consumer must actively agree to be contacted.',
      );
    }

    const score = this.calculateQualityScore(data);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // ML-enhanced lead scoring
    let mlScore: number | undefined;
    let mlFactors: Record<string, number> | undefined;
    let mlTier: string | undefined;
    try {
      const mlResult = await this.leadScoringService.scoreLead(data);
      mlScore = mlResult.score;
      mlFactors = mlResult.factors;
      mlTier = mlResult.tier;
    } catch (error) {
      this.logger.error(`ML scoring failed, falling back to rule-based: ${error}`);
    }

    const lead = this.leadsRepository.create({
      ...data,
      qualityScore: score,
      mlScore,
      mlFactors,
      mlTier,
      status: score >= 40 ? 'available' : 'new',
      expiresAt,
      // Use the real consent value and audit metadata from the request —
      // never force these. consentTimestamp records the moment of opt-in.
      tcpaConsent: data.tcpaConsent,
      consentLanguage: data.consentLanguage,
      consentIp: data.consentIp,
      consentUserAgent: data.consentUserAgent,
      consentPageVersion: data.consentPageVersion,
      consentTimestamp: new Date(),
    });

    const saved = await this.leadsRepository.save(lead);

    // Auto-trigger matching after lead submission
    try {
      await this.matchingService.findMatchesForLead(saved.id);
    } catch (error) {
      this.logger.error(`Auto-matching failed for lead ${saved.id}: ${error}`);
    }

    // Sync consumer assessment to CRM pipeline
    try {
      await this.crmService.createLead({
        firstName: saved.firstName,
        lastName: saved.lastName,
        email: saved.email,
        phone: saved.phone,
        source: CrmLeadSource.ASSESSMENT,
        userId: saved.userId ?? 'system',
        groupId: saved.state,
        consumerLeadId: saved.id,
        score: saved.qualityScore,
        aiScore: saved.mlScore,
      });
    } catch (error) {
      this.logger.error(`CRM sync failed for lead ${saved.id}: ${error}`);
    }

    // SI close-flow — score the family, hand back the priority-match
    // checkout link, queue the nurture sequence until they pay. Never
    // blocks the assessment itself.
    let closeFlow: IntakeResult | null = null;
    try {
      closeFlow = await this.closeFlow.intake(
        {
          leadRef: saved.id,
          firstName: saved.firstName,
          lastName: saved.lastName,
          email: saved.email,
          phone: saved.phone,
          zip: saved.zipCode,
          vertical: 'match_fee',
          budgetCents: saved.totalDebt != null ? Math.round(Number(saved.totalDebt) * 100) : null,
          message: undefined,
          details: {
            state: saved.state,
            debtTypes: saved.debtTypes,
            monthsBehind: saved.monthsBehind,
          },
        },
        SETTLE_SITE,
      );
      this.logger.log(
        `close-flow ${saved.id}: ${closeFlow.action} score=${closeFlow.score}${closeFlow.checkoutUrl ? ' +checkout' : ''}`,
      );
    } catch (e) {
      this.logger.error(`close-flow intake failed for lead ${saved.id}: ${e instanceof Error ? e.message : e}`);
    }

    return Object.assign(saved, { closeFlow });
  }

  private calculateQualityScore(data: Partial<Lead>): number {
    let score = 0;

    if (data.totalDebt && data.totalDebt >= 50000) score += 40;
    else if (data.totalDebt && data.totalDebt >= 25000) score += 30;
    else if (data.totalDebt && data.totalDebt >= 10000) score += 20;
    else if (data.totalDebt && data.totalDebt >= 7500) score += 10;

    if (data.monthsBehind && data.monthsBehind >= 3) score += 20;
    else if (data.monthsBehind && data.monthsBehind >= 1) score += 10;

    if (data.employmentStatus === 'employed') score += 20;
    else if (data.employmentStatus === 'self_employed') score += 15;
    else if (data.employmentStatus === 'retired') score += 10;

    if (data.monthlyIncome && data.monthlyIncome >= 5000) score += 20;
    else if (data.monthlyIncome && data.monthlyIncome >= 3000) score += 10;

    return Math.min(score, 100);
  }

  calculateLeadPrice(lead: Partial<Lead>): number {
    const debt = Number(lead.totalDebt) || 0;
    if (debt >= 50000) return 300;
    if (debt >= 25000) return 200;
    if (debt >= 15000) return 150;
    if (debt >= 10000) return 100;
    return 75;
  }

  async getAvailableLeads() {
    const leads = await this.leadsRepository.find({
      where: { status: 'available' },
      order: { qualityScore: 'DESC', createdAt: 'DESC' },
      take: 50,
    });

    // Mask sensitive PII (phone, email, lastName) for available leads that
    // have not been purchased — mirrors the masking in getLeadDetails.
    return leads.map((lead) => ({
      ...lead,
      phone: this.maskValue(lead.phone),
      email: this.maskEmail(lead.email),
      lastName: this.maskValue(lead.lastName),
    }));
  }

  async purchaseLead(leadId: string, providerId: string): Promise<Lead> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status !== 'available') throw new BadRequestException('Lead is no longer available');

    const provider = await this.providersService.getProviderById(providerId);
    const price = this.calculateLeadPrice(lead);

    if (Number(provider.creditBalance) < price) {
      throw new BadRequestException('Insufficient credit balance. Please add funds to your account.');
    }

    await this.providersService.deductCredit(providerId, price);

    await this.leadsRepository.update(leadId, {
      status: 'sold',
      purchasedBy: providerId,
      salePrice: price,
      purchasedAt: new Date(),
    });

    // Send lead purchase confirmation email to the provider
    try {
      await this.emailService.sendLeadPurchaseConfirmation(provider as any, lead, price);
    } catch (err) {
      this.logger.error(`Failed to send lead purchase confirmation: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Sync lead purchase to CRM
    try {
      let crmClient = await this.crmService.findClientByGroupId(provider.id);
      if (!crmClient) {
        crmClient = await this.crmService.createClient({
          firstName: provider.companyName,
          lastName: 'Provider',
          email: provider.email,
          phone: provider.phone,
          company: provider.companyName,
          source: 'provider_marketplace',
          userId: 'system',
          groupId: provider.id,
          assignedTo: provider.id,
        });
      }

      await this.crmService.createDeal({
        title: `Lead purchase: ${lead.firstName} ${lead.lastName}`,
        description: `Purchased ${lead.state} lead with $${lead.totalDebt} total debt`,
        clientId: crmClient.id,
        stage: CrmDealStage.PURCHASE,
        value: price,
        status: CrmDealStatus.WON,
        wonDate: new Date(),
        assignedTo: provider.id,
        userId: 'system',
        groupId: provider.id,
        tags: ['lead-purchase', `lead:${lead.id}`],
      });
    } catch (error) {
      this.logger.error(`CRM sync failed for lead purchase ${leadId}: ${error}`);
    }

    return this.leadsRepository.findOne({ where: { id: leadId } }) as Promise<Lead>;
  }

  async getLeadsByProvider(providerId: string) {
    return this.leadsRepository.find({
      where: { purchasedBy: providerId },
      order: { purchasedAt: 'DESC' },
    });
  }

  async getLeadStats() {
    const total = await this.leadsRepository.count();
    const available = await this.leadsRepository.count({ where: { status: 'available' } });
    const sold = await this.leadsRepository.count({ where: { status: 'sold' } });
    return { total, available, sold };
  }

  /**
   * Provider-only: get full lead details before purchase. Sensitive contact
   * info (phone, email, last name) is masked unless this provider has
   * purchased the lead.
   */
  async getLeadDetails(leadId: string, providerId: string) {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const purchased = lead.purchasedBy === providerId;
    if (purchased) {
      return { ...lead, isPurchased: true };
    }

    // Mask sensitive fields for unpurchased leads
    return {
      ...lead,
      phone: this.maskValue(lead.phone),
      email: this.maskEmail(lead.email),
      lastName: this.maskValue(lead.lastName),
      isPurchased: false,
    };
  }

  /**
   * Provider-only: purchase multiple leads in a single call. Returns results
   * per lead id with success/failure status. Skips leads that are unavailable
   * or that the provider cannot afford (deducts from credit balance per
   * successful purchase).
   */
  async batchPurchaseLeads(leadIds: string[], providerId: string) {
    const provider = await this.providersService.getProviderById(providerId);
    let remainingCredit = Number(provider.creditBalance) || 0;

    const crmClient = await this.crmService.findClientByGroupId(provider.id) ?? await this.crmService.createClient({
      firstName: provider.companyName,
      lastName: 'Provider',
      email: provider.email,
      phone: provider.phone,
      company: provider.companyName,
      source: 'provider_marketplace',
      userId: 'system',
      groupId: provider.id,
      assignedTo: provider.id,
    });

    const results: Array<{ leadId: string; success: boolean; price?: number; error?: string }> = [];
    const successful: Lead[] = [];

    for (const leadId of leadIds) {
      const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
      if (!lead) {
        results.push({ leadId, success: false, error: 'Lead not found' });
        continue;
      }
      if (lead.status !== 'available') {
        results.push({ leadId, success: false, error: 'Lead is no longer available' });
        continue;
      }

      const price = this.calculateLeadPrice(lead);
      if (remainingCredit < price) {
        results.push({ leadId, success: false, error: 'Insufficient credit balance' });
        continue;
      }

      await this.leadsRepository.update(leadId, {
        status: 'sold',
        purchasedBy: providerId,
        salePrice: price,
        purchasedAt: new Date(),
      });
      await this.providersService.deductCredit(providerId, price);
      remainingCredit -= price;
      successful.push(lead);
      results.push({ leadId, success: true, price });

      // Sync batch lead purchase to CRM
      try {
        await this.crmService.createDeal({
          title: `Lead purchase: ${lead.firstName} ${lead.lastName}`,
          description: `Purchased ${lead.state} lead with $${lead.totalDebt} total debt`,
          clientId: crmClient.id,
          stage: CrmDealStage.PURCHASE,
          value: price,
          status: CrmDealStatus.WON,
          wonDate: new Date(),
          assignedTo: provider.id,
          userId: 'system',
          groupId: provider.id,
          tags: ['lead-purchase', `lead:${lead.id}`],
        });
      } catch (error) {
        this.logger.error(`CRM sync failed for batch lead purchase ${leadId}: ${error}`);
      }
    }

    return {
      results,
      purchased: successful.length,
      failed: results.length - successful.length,
      totalCost: results.reduce((sum, r) => sum + (r.success ? (r.price as number) : 0), 0),
      remainingCredit,
    };
  }

  /**
   * Consumer: checks whether their lead has been purchased. Returns a boolean
   * and the provider's company name if purchased.
   */
  async getLeadStatus(leadId: string): Promise<{
    purchased: boolean;
    providerName?: string;
    purchasedAt?: Date;
    matchFeePaid: boolean;
    matchFeeRequired: boolean;
  }> {
    const lead = await this.leadsRepository.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const matchFeePaid = !!lead.matchFeePaidAt;
    const matchFeeRequired = !matchFeePaid;
    if (lead.status === 'sold' && lead.purchasedBy) {
      try {
        const provider = await this.providersService.getProviderById(lead.purchasedBy);
        return {
          purchased: true,
          providerName: (provider as any).companyName,
          purchasedAt: lead.purchasedAt,
          matchFeePaid,
          matchFeeRequired,
        };
      } catch {
        return { purchased: true, purchasedAt: lead.purchasedAt, matchFeePaid, matchFeeRequired };
      }
    }

    return { purchased: false, matchFeePaid, matchFeeRequired };
  }

  /** Raw lead lookup for the close-flow match-checkout endpoint. */
  async findRawById(leadId: string): Promise<Lead | null> {
    return this.leadsRepository.findOne({ where: { id: leadId } });
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