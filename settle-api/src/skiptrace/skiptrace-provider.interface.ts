export interface SkipTraceLookupInput {
  firstName?: string;
  lastName?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface SkipTracePhone {
  number: string; // E.164 or 10-digit; normalized upstream
  type?: string; // 'Wireless' | 'Land Line' | ...
  score?: number; // vendor confidence 0-100
  carrier?: string;
  reachable?: boolean;
  dnc?: boolean; // vendor DNC flag
  tcpa?: boolean;
  lastReportedDate?: string;
}

export interface SkipTracePerson {
  name?: string;
  phones: SkipTracePhone[];
  mailingStreet?: string;
  mailingCity?: string;
  mailingState?: string;
  mailingZip?: string;
  litigator?: boolean;
  bankruptcy?: boolean;
  dncTcpa?: boolean; // person-level TCPA/DNC flag
}

export interface SkipTraceResult {
  requestId?: string;
  persons: SkipTracePerson[];
  matchCount: number;
  raw?: unknown;
}

export interface SkipTraceProvider {
  readonly name: string;
  isConfigured(): boolean;
  lookup(inputs: SkipTraceLookupInput[]): Promise<SkipTraceResult>;
}

export class SkipTraceNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Skip-trace provider '${provider}' is not configured`);
    this.name = 'SkipTraceNotConfiguredError';
  }
}

export class SkipTraceUpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SkipTraceUpstreamError';
  }
}
