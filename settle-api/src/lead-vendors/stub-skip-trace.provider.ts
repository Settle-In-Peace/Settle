import { Injectable } from '@nestjs/common';
import {
  SkipTraceLookupResult,
  SkipTraceProvider,
  SkipTraceQuery,
} from './skip-trace-provider.interface';

/**
 * Default provider when no skip-trace vendor is wired. Every lookup lands as
 * status='manual' with zero cost — the queue + review flow works today, and
 * swapping in a real vendor later is a config + provider-class change only.
 */
@Injectable()
export class StubSkipTraceProvider implements SkipTraceProvider {
  readonly name = 'stub';

  isConfigured(): boolean {
    return true; // always available — it's the manual-workflow fallback
  }

  async lookup(_query: SkipTraceQuery): Promise<SkipTraceLookupResult> {
    return {
      status: 'manual',
      estimatedCost: 0,
      notes:
        'No skip-trace vendor configured — queued for manual review. ' +
        'Set SKIP_TRACE_PROVIDER + vendor env vars to automate.',
    };
  }
}
