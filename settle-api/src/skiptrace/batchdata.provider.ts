import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SkipTraceLookupInput,
  SkipTracePerson,
  SkipTracePhone,
  SkipTraceProvider,
  SkipTraceResult,
  SkipTraceUpstreamError,
} from './skiptrace-provider.interface';

/**
 * BatchData property skip-trace.
 * POST /api/v1/property/skip-trace — Bearer auth, batch via `requests[]`.
 * Sandbox keys return fabricated records for free; live keys bill $0.07/record.
 */
@Injectable()
export class BatchDataProvider implements SkipTraceProvider {
  readonly name = 'batchdata';
  private readonly logger = new Logger(BatchDataProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    // Production picks up the live key; dev/staging uses the sandbox key.
    const live = this.config.get<string>('SKIPTRACE_LIVE_API_KEY');
    const sandbox = this.config.get<string>('SKIPTRACE_API_KEY');
    return process.env.NODE_ENV === 'production' ? live || sandbox || '' : sandbox || live || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async lookup(inputs: SkipTraceLookupInput[], opts?: { apiKey?: string }): Promise<SkipTraceResult> {
    const res = await this.request('/property/skip-trace', {
      requests: inputs.map((i) => ({
        name: i.firstName || i.lastName ? `${i.firstName ?? ''} ${i.lastName ?? ''}`.trim() : undefined,
        propertyAddress: {
          street: i.street,
          city: i.city,
          state: i.state,
          zip: i.zip,
        },
      })),
    }, opts?.apiKey);
    return this.normalize(res);
  }

  private async request(path: string, body: unknown, apiKey?: string): Promise<any> {
    const r = await fetch(`https://api.batchdata.com/api/v1${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey || this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
      const msg = data?.status?.message || data?.message || `BatchData ${r.status}`;
      throw new SkipTraceUpstreamError(`BatchData ${path} failed: ${msg}`, r.status);
    }
    return data;
  }

  private normalize(data: any): SkipTraceResult {
    const results = data?.results;
    const persons: SkipTracePerson[] = (results?.persons ?? []).map((p: any) => {
      const owner = p?.property?.owner;
      const addr = owner?.mailingAddress ?? p?.mailingAddress ?? {};
      const phones: SkipTracePhone[] = (p?.phoneNumbers ?? []).map((ph: any) => ({
        number: String(ph?.number ?? ''),
        type: ph?.type,
        score: ph?.score,
        carrier: ph?.carrier,
        reachable: ph?.reachable,
        dnc: ph?.dnc,
        tcpa: ph?.tcpa,
        lastReportedDate: ph?.lastReportedDate,
      }));
      return {
        name: owner?.name?.full ?? p?.name?.full,
        phones,
        mailingStreet: addr?.formattedStreet ?? addr?.streetNoUnit ?? addr?.street,
        mailingCity: addr?.city,
        mailingState: addr?.state,
        mailingZip: addr?.zip,
        litigator: p?.litigator,
        bankruptcy: p?.bankruptcy?.bankruptcy,
        dncTcpa: p?.dnc?.tcpa,
      };
    });
    return {
      requestId: results?.meta?.requestId,
      persons,
      matchCount: results?.meta?.results?.matchCount ?? persons.length,
      raw: data,
    };
  }
}
