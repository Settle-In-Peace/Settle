import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadVendorAccount } from '../entities/lead-vendor-account.entity';
import { LeadVendorProvider, LeadVendorStatus } from './lead-vendor-provider.interface';
import {
  PingPostVendorConfig,
  PingPostVendorProvider,
} from './ping-post.provider';

/**
 * Resolves lead vendors from three config sources, merged in this order
 * (later wins for non-secret fields):
 *
 *   1. `LEADVENDORS_CONFIG` — a JSON array of PingPostVendorConfig objects.
 *   2. `LEADVENDOR_NAMES` + `LEADVENDOR_<NAME>_*` env vars per vendor.
 *   3. `lead_vendor_accounts` DB rows — display name, active flag, and
 *      non-secret `config` overrides. Secrets are resolved only through
 *      `api_key_ref`/`webhook_secret_ref` env-var names, never from the row.
 *
 * Secrets are therefore ALWAYS environment variables — the DB carries the
 * name of the env var, not the secret value.
 */
@Injectable()
export class LeadVendorRegistry {
  private readonly logger = new Logger(LeadVendorRegistry.name);
  private providers: Map<string, LeadVendorProvider> | null = null;
  private accounts: Map<string, LeadVendorAccount> | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(LeadVendorAccount)
    private readonly accountsRepository: Repository<LeadVendorAccount>,
  ) {}

  static envPrefix(name: string): string {
    return `LEADVENDOR_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  }

  /** Reload cached providers/accounts (after an account row is updated). */
  refresh(): void {
    this.providers = null;
    this.accounts = null;
  }

  private async loadAccounts(): Promise<Map<string, LeadVendorAccount>> {
    if (!this.accounts) {
      const rows = await this.accountsRepository.find();
      this.accounts = new Map(rows.map((r) => [r.vendorName.toLowerCase(), r]));
    }
    return this.accounts;
  }

  /** All known vendor names from env config + DB accounts. */
  async vendorNames(): Promise<string[]> {
    const names = new Set<string>();
    for (const cfg of this.parseJsonConfig()) names.add(cfg.name);
    for (const name of this.parseNamesEnv()) names.add(name);
    for (const name of (await this.loadAccounts()).keys()) names.add(name);
    return [...names];
  }

  /** Resolve the effective config for a vendor name, secrets from env only. */
  private async resolveConfig(name: string): Promise<PingPostVendorConfig> {
    const prefix = LeadVendorRegistry.envPrefix(name);
    const get = (key: string) => this.config.get<string>(`${prefix}_${key}`, '');

    const fromJson = this.parseJsonConfig().find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    const account = (await this.loadAccounts()).get(name.toLowerCase());
    const dbConfig = (account?.config ?? {}) as Partial<PingPostVendorConfig>;

    const cfg: PingPostVendorConfig = {
      ...fromJson,
      ...dbConfig,
      name,
      displayName:
        account?.displayName ??
        dbConfig.displayName ??
        fromJson?.displayName ??
        (get('DISPLAY_NAME') || name),
      pingUrl: get('PING_URL') || dbConfig.pingUrl || fromJson?.pingUrl,
      postUrl: get('POST_URL') || dbConfig.postUrl || fromJson?.postUrl,
      orderUrl: get('ORDER_URL') || dbConfig.orderUrl || fromJson?.orderUrl,
      // apiKey: env-first. If the account names a different env var via
      // apiKeyRef, honour it; DB-stored key material is never read.
      apiKey:
        get('KEY') ||
        get('API_KEY') ||
        (account?.apiKeyRef ? this.config.get<string>(account.apiKeyRef, '') : '') ||
        fromJson?.apiKey,
      authStyle:
        (get('AUTH') as PingPostVendorConfig['authStyle']) ||
        dbConfig.authStyle ||
        fromJson?.authStyle,
      authHeader: get('AUTH_HEADER') || dbConfig.authHeader || fromJson?.authHeader,
      authParam: get('AUTH_PARAM') || dbConfig.authParam || fromJson?.authParam,
      format:
        (get('FORMAT') as PingPostVendorConfig['format']) ||
        dbConfig.format ||
        fromJson?.format,
      basePrice:
        (get('BASE_PRICE') ? Number(get('BASE_PRICE')) : undefined) ??
        (account?.defaultPrice !== undefined && account?.defaultPrice !== null
          ? Number(account.defaultPrice)
          : undefined) ??
        dbConfig.basePrice ??
        fromJson?.basePrice,
      products: dbConfig.products ?? fromJson?.products,
      fieldMap: {
        ...(fromJson?.fieldMap ?? {}),
        ...(dbConfig.fieldMap ?? {}),
        ...parseJsonEnv<Record<string, string>>(get('FIELD_MAP')),
      },
      timeoutMs: Number(get('TIMEOUT_MS')) || dbConfig.timeoutMs || fromJson?.timeoutMs,
      maxRetries: get('MAX_RETRIES') !== ''
        ? Number(get('MAX_RETRIES'))
        : dbConfig.maxRetries ?? fromJson?.maxRetries,
    };
    return cfg;
  }

  private parseJsonConfig(): PingPostVendorConfig[] {
    const raw = this.config.get<string>('LEADVENDORS_CONFIG', '');
    if (!raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((c) => c?.name) : [];
    } catch (err) {
      this.logger.error(`LEADVENDORS_CONFIG is not valid JSON: ${err}`);
      return [];
    }
  }

  private parseNamesEnv(): string[] {
    return this.config
      .get<string>('LEADVENDOR_NAMES', '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
  }

  private async buildProviders(): Promise<Map<string, LeadVendorProvider>> {
    const map = new Map<string, LeadVendorProvider>();
    for (const name of await this.vendorNames()) {
      const cfg = await this.resolveConfig(name);
      map.set(name.toLowerCase(), new PingPostVendorProvider(cfg));
    }
    return map;
  }

  /** Throwing lookup — unknown vendor names are a client error (404). */
  async getProvider(name: string): Promise<LeadVendorProvider> {
    if (!this.providers) this.providers = await this.buildProviders();
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new NotFoundException(`Unknown lead vendor: ${name}`);
    }
    return provider;
  }

  /** Status snapshots for every known vendor (outbound + DB accounts). */
  async listVendors(): Promise<LeadVendorStatus[]> {
    if (!this.providers) this.providers = await this.buildProviders();
    const accounts = await this.loadAccounts();
    const out: LeadVendorStatus[] = [];
    for (const [key, provider] of this.providers) {
      const status = await provider.status();
      const account = accounts.get(key);
      out.push({ ...status, active: account ? account.isActive : true });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Whether a vendor account is active (defaults true for env-only vendors). */
  async isActive(name: string): Promise<boolean> {
    const account = (await this.loadAccounts()).get(name.toLowerCase());
    return account ? account.isActive : true;
  }

  /**
   * Resolve the HMAC secret for an inbound vendor webhook, env-first:
   * `LEADVENDOR_<NAME>_WEBHOOK_SECRET`, then the env var named by the
   * account's `webhook_secret_ref`. Returns null when nothing is configured —
   * callers must fail closed (unsigned webhooks are never accepted).
   */
  async webhookSecret(name: string): Promise<string | null> {
    const direct = this.config.get<string>(
      `${LeadVendorRegistry.envPrefix(name)}_WEBHOOK_SECRET`,
      '',
    );
    if (direct) return direct;
    const account = (await this.loadAccounts()).get(name.toLowerCase());
    if (account?.webhookSecretRef) {
      return this.config.get<string>(account.webhookSecretRef, '') || null;
    }
    return null;
  }
}

function parseJsonEnv<T>(raw: string): T | undefined {
  if (!raw?.trim()) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
