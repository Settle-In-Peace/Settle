import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrgPhoneNumber } from '../entities/org-phone-number.entity';
import { Org } from './org.entity';

const TELNYX_BASE = 'https://api.telnyx.com/v2';

@Injectable()
export class NumbersService {
  private readonly logger = new Logger(NumbersService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(OrgPhoneNumber)
    private readonly numbers: Repository<OrgPhoneNumber>,
    @InjectRepository(Org)
    private readonly orgs: Repository<Org>,
  ) {}

  private apiKey(): string {
    const key = this.config.get<string>('TELNYX_API_KEY');
    if (!key) throw new ServiceUnavailableException('TELNYX_API_KEY is not configured');
    return key;
  }

  private async telnyx(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${TELNYX_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = data?.errors?.[0]?.detail || data?.error || `Telnyx ${res.status}`;
      throw new BadRequestException(`Telnyx ${path} failed: ${msg}`);
    }
    return data;
  }

  /** Search US numbers by area code or prefix (e.g. "951"). */
  async search(prefix: string, limit = 10) {
    const clean = prefix.replace(/\D/g, '');
    if (!clean) throw new BadRequestException('Provide digits to search (area code or prefix)');
    const data = await this.telnyx(
      `/available_phone_numbers?filter[phone_number][starts_with]=%2B1${clean}&filter[country_code]=US&filter[features][]=voice&filter[limit]=${limit}`,
    );
    return (data?.data ?? []).map((n: any) => ({
      phoneNumber: n.phone_number,
      locality: n.locality,
      region: n.region,
      costInformation: n.cost_information,
      features: n.features,
    }));
  }

  /** Order a searched number — writes the row + seeds org allowed_caller_ids. */
  async order(orgId: string, phoneNumber: string, friendlyName?: string) {
    const e164 = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
    const dup = await this.numbers.findOne({ where: { orgId, phoneNumber: e164 } });
    if (dup) return dup;

    const order = await this.telnyx('/number_orders', {
      method: 'POST',
      body: JSON.stringify({ phone_numbers: [{ phone_number: e164 }] }),
    });

    const row = this.numbers.create({
      orgId,
      phoneNumber: e164,
      telnyxOrderId: order?.data?.id,
      status: 'active',
      friendlyName,
    });
    const saved = await this.numbers.save(row);

    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (org) {
      const allowed = new Set([...(org.allowedCallerIds ?? []), e164]);
      org.allowedCallerIds = [...allowed];
      await this.orgs.save(org);
    }
    this.logger.log(`Ordered ${e164} for org ${orgId} (order ${order?.data?.id})`);
    return saved;
  }

  list(orgId: string) {
    return this.numbers.find({ where: { orgId }, order: { createdAt: 'DESC' } });
  }

  /** Mark released — keeps the audit row, removes the caller-ID grant. */
  async release(orgId: string, id: string) {
    const row = await this.numbers.findOne({ where: { id, orgId } });
    if (!row) throw new BadRequestException('Number not found in this org');
    row.status = 'released';
    await this.numbers.save(row);

    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (org?.allowedCallerIds) {
      org.allowedCallerIds = org.allowedCallerIds.filter((n) => n !== row.phoneNumber);
      await this.orgs.save(org);
    }
    return { released: true, phoneNumber: row.phoneNumber };
  }
}
