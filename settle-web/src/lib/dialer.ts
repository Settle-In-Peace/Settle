import { getAuthenticatedApi } from './api';

// ── Dialer (settle-api /dialer/*) — sales/admin only ─────────────────────
// Separate file so the shared api.ts surface stays untouched.

export interface DialerProviderStatus {
  activeProvider: string;
  providers: { name: string; configured: boolean }[];
}

export interface DialerCall {
  id: string;
  contactId?: string;
  debtId?: string;
  collectionAccountId?: string;
  agentId?: string;
  phoneNumber: string;
  fromNumber?: string;
  direction: 'inbound' | 'outbound';
  status:
    | 'queued'
    | 'dialing'
    | 'ringing'
    | 'answered'
    | 'completed'
    | 'no_answer'
    | 'busy'
    | 'failed'
    | 'voicemail'
    | 'cancelled';
  provider: string;
  providerCallId?: string;
  manualDial: boolean;
  consentConfirmed: boolean;
  consentMethod?: string;
  startedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  duration?: number;
  recordingUrl?: string;
  hangupCause?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceCallPayload {
  to: string;
  from?: string;
  contactId?: string;
  debtId?: string;
  collectionAccountId?: string;
  consentConfirmed?: boolean;
  manualDial?: boolean;
  agentExtension?: string;
  notes?: string;
}

function dialerApi() {
  return getAuthenticatedApi();
}

/** Provider config status — safe to call even when unconfigured. */
export function getDialerStatus() {
  return dialerApi()<DialerProviderStatus>('/dialer/status', { method: 'GET' });
}

export function placeDialerCall(payload: PlaceCallPayload) {
  return dialerApi()<DialerCall>('/dialer/call', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getDialerCalls(filter: {
  contactId?: string;
  debtId?: string;
  collectionAccountId?: string;
}) {
  const params = new URLSearchParams();
  if (filter.contactId) params.set('contactId', filter.contactId);
  if (filter.debtId) params.set('debtId', filter.debtId);
  if (filter.collectionAccountId)
    params.set('collectionAccountId', filter.collectionAccountId);
  const qs = params.toString();
  return dialerApi()<DialerCall[]>(`/dialer/calls${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export function getDialerCall(id: string) {
  return dialerApi()<DialerCall>(`/dialer/calls/${id}`, { method: 'GET' });
}

export function hangupDialerCall(id: string) {
  return dialerApi()<DialerCall>(`/dialer/calls/${id}/hangup`, {
    method: 'POST',
  });
}

// ── Agent work queue + stats (settle-api seats module) ────────────────────

export interface QueueCompliance {
  blocked: boolean;
  reasons: string[];
  dnc: boolean;
  doNotCall: boolean;
  consentOnFile: boolean;
  fdcpa: {
    status: 'ok' | 'outside' | 'unknown';
    localHour?: number;
    timeZone?: string;
    state?: string;
  };
}

export interface QueueItem {
  type: 'account' | 'lead';
  /** accountId for type='account', leadId for type='lead' */
  id: string;
  clientId?: string;
  name: string;
  phone?: string;
  status: string;
  balance?: number;
  priority?: number;
  delinquencyDays?: number;
  lastContactAt?: string;
  compliance: QueueCompliance;
}

export interface AgentStatsBucket {
  calls: number;
  answered: number;
  avgDurationSeconds: number;
  dispositions: Record<string, number>;
}

export interface TeamAgentStats {
  userId: string;
  orgRole: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  today: AgentStatsBucket;
  week: AgentStatsBucket;
}

export function getDialerQueue() {
  return dialerApi()<{ generatedAt: string; items: QueueItem[] }>('/dialer/queue', {
    method: 'GET',
  });
}

export function getDialerMyStats() {
  return dialerApi()<{ agentId: string; today: AgentStatsBucket; week: AgentStatsBucket }>(
    '/dialer/my-stats',
    { method: 'GET' },
  );
}

export function getDialerTeamStats() {
  return dialerApi()<{
    orgId: string;
    agents: TeamAgentStats[];
    liveCalls: {
      id: string;
      agentId?: string;
      agentName?: string;
      phoneNumber: string;
      status: string;
      startedAt?: string;
      createdAt: string;
    }[];
  }>('/dialer/team-stats', { method: 'GET' });
}

export function setDialerCallDisposition(callId: string, disposition: string, notes?: string) {
  return dialerApi()<DialerCall>(`/dialer/calls/${callId}/disposition`, {
    method: 'POST',
    body: JSON.stringify({ disposition, notes }),
  });
}

// ── Collection AI (script pane) ────────────────────────────────────────────

export interface NextActionResult {
  accountId: string;
  action: 'call' | 'email' | 'sms' | 'letter' | 'settle' | 'escalate';
  reason: string;
  scriptSnippet?: string;
  requiresReview: true;
  generatedAt: string;
}

export function getNextAction(accountId: string) {
  return dialerApi()<NextActionResult>('/collection-ai/next-action', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}
