import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AffiliateConversion,
  AffiliateConversionStatus,
} from './affiliate-conversion.entity';

export interface PostbackResult {
  received: boolean;
  duplicate: boolean;
  conversion: AffiliateConversion;
}

/**
 * AffiliatesService — records and reconciles inbound affiliate-network
 * postbacks. Every network names its params differently, so we normalize the
 * common aliases and always persist the full raw payload.
 */
@Injectable()
export class AffiliatesService {
  private readonly logger = new Logger(AffiliatesService.name);

  constructor(
    @InjectRepository(AffiliateConversion)
    private readonly conversions: Repository<AffiliateConversion>,
  ) {}

  /**
   * Record a postback. `params` is the merged query+body map. When the
   * network supplies a transaction id we've already recorded, the postback
   * is treated as a duplicate retry and the existing row is returned — the
   * endpoint still answers 200 so the network stops retrying.
   */
  async recordConversion(
    network: string,
    params: Record<string, unknown>,
  ): Promise<PostbackResult> {
    const transactionId = this.pick(params, [
      'transaction_id',
      'transactionId',
      'txid',
      'txn_id',
      'order_id',
      'orderId',
      'conversion_id',
      'conversionId',
    ]);

    if (transactionId) {
      const existing = await this.conversions.findOne({
        where: { network, transactionId },
      });
      if (existing) {
        return { received: true, duplicate: true, conversion: existing };
      }
    }

    const conversion = this.conversions.create({
      network,
      transactionId: transactionId || undefined,
      clickId: this.pick(params, [
        'click_id',
        'clickId',
        'sub_id',
        'subid',
        'subId',
        'aff_sub',
        's1',
        's2',
      ]),
      leadId: this.uuidOrUndefined(
        this.pick(params, ['lead_id', 'leadId', 'lead']),
      ),
      payoutCents: this.payoutToCents(params),
      currency: (
        this.pick(params, ['currency', 'currency_code']) || 'USD'
      )
        .toUpperCase()
        .slice(0, 8),
      status: this.normalizeStatus(this.pick(params, ['status', 'state'])),
      eventType: (
        this.pick(params, ['event_type', 'eventType', 'event', 'type']) ||
        'conversion'
      ).slice(0, 40),
      rawPayload: params,
    });

    let saved: AffiliateConversion;
    try {
      saved = await this.conversions.save(conversion);
    } catch (err: any) {
      // Unique-index race: a concurrent postback with the same
      // (network, transaction_id) won. Return the winner as a duplicate.
      if (transactionId && String(err?.code) === '23505') {
        const existing = await this.conversions.findOne({
          where: { network, transactionId },
        });
        if (existing) {
          return { received: true, duplicate: true, conversion: existing };
        }
      }
      throw err;
    }

    this.logger.log(
      `Affiliate conversion recorded: ${network} txn=${transactionId ?? 'n/a'} payout=${saved.payoutCents ?? 'n/a'}`,
    );
    return { received: true, duplicate: false, conversion: saved };
  }

  /** Admin: recent conversions, optional network/status filter. */
  list(opts: { network?: string; status?: string; limit?: number }) {
    const qb = this.conversions
      .createQueryBuilder('c')
      .orderBy('c.receivedAt', 'DESC')
      .limit(Math.min(opts.limit ?? 50, 500));
    if (opts.network) qb.andWhere('c.network = :network', { network: opts.network });
    if (opts.status) qb.andWhere('c.status = :status', { status: opts.status });
    return qb.getMany();
  }

  /** Admin: payout totals grouped by network + status for reconciliation. */
  async summary() {
    const rows = await this.conversions
      .createQueryBuilder('c')
      .select('c.network', 'network')
      .addSelect('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(c.payoutCents), 0)', 'payoutCents')
      .groupBy('c.network')
      .addGroupBy('c.status')
      .getRawMany();
    return rows.map((r) => ({
      network: r.network,
      status: r.status,
      count: Number(r.count),
      payoutCents: Number(r.payoutCents),
    }));
  }

  /** Admin: mark a conversion approved/rejected/paid during reconciliation. */
  async updateStatus(id: string, status: AffiliateConversionStatus) {
    const conversion = await this.conversions.findOne({ where: { id } });
    if (!conversion) {
      throw new NotFoundException('Conversion not found');
    }
    conversion.status = status;
    return this.conversions.save(conversion);
  }

  // --- normalization helpers ------------------------------------------------

  private pick(
    params: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = params[key];
      if (value === undefined || value === null) continue;
      const str = String(value).trim();
      if (str) return str;
    }
    return undefined;
  }

  private uuidOrUndefined(value?: string): string | undefined {
    if (!value) return undefined;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value
      : undefined;
  }

  /**
   * Networks send payout as a decimal currency string ("50.00") — sometimes
   * as integer minor units under a *_cents key. Prefer explicit cents keys;
   * otherwise parse the decimal. Values without a decimal point are treated
   * as whole currency units (postback networks virtually always send
   * decimal currency, and the raw payload is preserved for correction).
   */
  private payoutToCents(
    params: Record<string, unknown>,
  ): number | undefined {
    const centsRaw = this.pick(params, [
      'payout_cents',
      'commission_cents',
      'amount_cents',
    ]);
    if (centsRaw) {
      const cents = Math.round(Number(centsRaw));
      if (Number.isFinite(cents)) return cents;
    }

    const raw = this.pick(params, [
      'payout',
      'commission',
      'amount',
      'sale_amount',
      'saleAmount',
      'payout_amount',
    ]);
    if (!raw) return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) return undefined;
    return Math.round(value * 100);
  }

  private normalizeStatus(raw?: string): AffiliateConversionStatus {
    const v = (raw || '').toLowerCase();
    if (['approved', 'confirmed', 'valid', 'accepted', 'locked'].includes(v)) {
      return AffiliateConversionStatus.APPROVED;
    }
    if (['rejected', 'declined', 'invalid', 'reversed', 'void'].includes(v)) {
      return AffiliateConversionStatus.REJECTED;
    }
    if (['paid', 'settled', 'invoiced'].includes(v)) {
      return AffiliateConversionStatus.PAID;
    }
    return AffiliateConversionStatus.PENDING;
  }
}
