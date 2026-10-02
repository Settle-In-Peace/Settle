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
