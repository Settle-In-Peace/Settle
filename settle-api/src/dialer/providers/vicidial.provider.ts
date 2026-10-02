import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DialerCallStatus,
  DialerProvider,
  NormalizedWebhookEvent,
  PlaceCallRequest,
  PlaceCallResult,
  ProviderCallStatusResult,
} from '../dialer-provider.interface';

/** Thrown when ViciDial credentials are missing. Maps to HTTP 503 upstream. */
export class VicidialNotConfiguredError extends Error {
  constructor() {
    super(
      'ViciDial is not configured. Set VICIDIAL_BASE_URL, VICIDIAL_API_USER, VICIDIAL_API_PASS and VICIDIAL_AGENT_USER.',
    );
    this.name = 'VicidialNotConfiguredError';
  }
}

/** Thrown for ViciDial API failures. */
export class VicidialUpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'VicidialUpstreamError';
  }
}

/**
 * ViciDial provider — free/open-source dialer via the Non-Agent API.
 *
 * ⚠️ UNTESTED AGAINST A LIVE VICIDIAL CLUSTER. The Non-Agent API contract
 * below follows the public docs (https://www.vicidial.org/VICIDIALforum/ —
 * NON-AGENT API doc for /agc/api.php), but every path here needs verification
 * against a real installation before production use.
 *
 * Env:
 *   VICIDIAL_BASE_URL    — e.g. https://dialer.example.com (no trailing slash;
 *                          the api.php path is appended unless overridden)
 *   VICIDIAL_API_PATH    — default '/agc/api.php'
 *   VICIDIAL_API_USER    — ViciDial API-enabled user
 *   VICIDIAL_API_PASS    — its password (sent as a query param by the API —
 *                          HTTPS is mandatory)
 *   VICIDIAL_SOURCE      — 'source' value, must be enabled for API use in the
 *                          ViciDial admin (default 'settle')
 *   VICIDIAL_AGENT_USER  — default agent_user extension used for
 *                          external_dial/originate when the request does not
 *                          specify agentExtension
 *   VICIDIAL_PHONE_CODE  — default '1' (NANP)
 *   VICIDIAL_LIST_ID     — default list for add_lead
 *
 * Webhooks: ViciDial does not emit signed webhooks. Call state must be polled
 * (external_status / call_status functions) or pushed by a custom
 * dispo/deadcall URL on the server — ingestWebhook() returns null.
 */
@Injectable()
export class VicidialProvider implements DialerProvider {
  readonly name = 'vicidial';
  private readonly logger = new Logger(VicidialProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('VICIDIAL_BASE_URL', '').replace(/\/$/, '');
  }

  private get apiPath(): string {
    return this.config.get<string>('VICIDIAL_API_PATH', '/agc/api.php');
  }

  private get apiUser(): string {
    return this.config.get<string>('VICIDIAL_API_USER', '');
  }

  private get apiPass(): string {
    return this.config.get<string>('VICIDIAL_API_PASS', '');
  }

  private get source(): string {
    return this.config.get<string>('VICIDIAL_SOURCE', 'settle');
  }

  private get defaultAgentUser(): string {
    return this.config.get<string>('VICIDIAL_AGENT_USER', '');
  }

  private get phoneCode(): string {
    return this.config.get<string>('VICIDIAL_PHONE_CODE', '1');
  }

  private get timeoutMs(): number {
    return this.config.get<number>('VICIDIAL_TIMEOUT_MS', 15_000);
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiUser && this.apiPass);
  }

  // ── HTTP plumbing ──────────────────────────────────────────────────────
  //
  // The Non-Agent API is GET-only with credentials as query params. Never log
  // the URL (it contains api credentials) — log function name + status only.

  private async callApi(
    fn: string,
    params: Record<string, string>,
  ): Promise<string> {
    if (!this.isConfigured()) throw new VicidialNotConfiguredError();

    const qs = new URLSearchParams({
      source: this.source,
      user: this.apiUser,
      pass: this.apiPass,
      function: fn,
      ...params,
    });
    const url = `${this.baseUrl}${this.apiPath}?${qs.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      throw new VicidialUpstreamError(
        `ViciDial unreachable: ${isTimeout ? 'timeout' : (err as Error).message}`,
      );
    }
    clearTimeout(timer);

    const text = (await res.text()).slice(0, 500);
    if (!res.ok) {
      throw new VicidialUpstreamError(
        `ViciDial ${fn} failed (${res.status}): ${text}`,
        res.status,
      );
    }
    // ViciDial returns plain text starting with ERROR/SUCCESS — surface errors.
    if (/^\s*ERROR/i.test(text)) {
      throw new VicidialUpstreamError(`ViciDial ${fn} rejected: ${text}`);
    }
    this.logger.log(`ViciDial ${fn} -> ${res.status}`);
    return text;
  }

  // ── DialerProvider ─────────────────────────────────────────────────────

  /**
   * UNTESTED: originate a call through the agent session via
   * function=external_dial. Requires the agent_user to be logged into an
   * active ViciDial session; the call is placed from the agent's channel to
   * `value` (the phone number, digits only).
   */
  async placeCall(req: PlaceCallRequest): Promise<PlaceCallResult> {
    const agentUser = req.agentExtension || this.defaultAgentUser;
    if (!agentUser) {
      throw new VicidialNotConfiguredError();
    }

    const phoneDigits = req.to.replace(/^\+/, '');
    const responseText = await this.callApi('external_dial', {
      agent_user: agentUser,
      value: phoneDigits,
      phone_code: this.phoneCode,
      search: 'NO',
      preview: 'NO',
      focus: 'YES',
      // TCPA flags are recorded on our side; ViciDial's dial_method for the
      // campaign governs autodial behaviour — manualDial=false callers should
      // be routed through an auto-dial campaign instead of external_dial.
    });

    // The API does not return a stable call id for external_dial — the
    // providerCallId falls back to a response-derived token when present.
    const idMatch = responseText.match(/(?:call_id|channel)[:\s]+([A-Za-z0-9._-]+)/i);
    return {
      providerCallId: idMatch?.[1],
      status: DialerCallStatus.DIALING,
      rawResponse: { vicidial_response: responseText },
    };
  }

  /** UNTESTED: function=external_hangup against the agent session. */
  async hangup(providerCallId: string): Promise<void> {
    const agentUser = this.defaultAgentUser;
    await this.callApi('external_hangup', {
      agent_user: agentUser,
      value: providerCallId || '1',
    });
  }

  /** UNTESTED: function=external_status to change/query the agent call state. */
  async callStatus(providerCallId: string): Promise<ProviderCallStatusResult> {
    const text = await this.callApi('call_status_change', {
      agent_user: this.defaultAgentUser,
      value: providerCallId,
    });
    return {
      status: DialerCallStatus.DIALING,
      providerStatus: text.trim().slice(0, 100),
      rawResponse: { vicidial_response: text.slice(0, 500) },
    };
  }

  /**
   * ViciDial stores recordings on the server filesystem / recording web path
   * (typically /RECORDINGS/MP3/). There is no Non-Agent lookup — return null
   * and rely on the raw_response/provider metadata. UNTESTED.
   */
  async recordingUrl(_providerCallId: string): Promise<string | null> {
    return null;
  }

  /**
   * ViciDial has no signed webhook story — returns null. Use polling via
   * callStatus() or a server-side dispo URL integration. UNTESTED.
   */
  ingestWebhook(_body: Record<string, any>): NormalizedWebhookEvent | null {
    return null;
  }

  async healthCheck(): Promise<boolean> {
    return this.isConfigured();
  }

  // ── ViciDial-specific helpers (not part of DialerProvider) ────────────

  /**
   * UNTESTED: function=add_lead — push a contact into a ViciDial list.
   * Requires VICIDIAL_LIST_ID plus optional name/address fields.
   */
  async addLead(params: {
    phoneNumber: string;
    listId?: string;
    firstName?: string;
    lastName?: string;
    externalKey?: string;
  }): Promise<string> {
    const listId = params.listId || this.config.get<string>('VICIDIAL_LIST_ID', '');
    if (!listId) {
      throw new VicidialNotConfiguredError();
    }
    return this.callApi('add_lead', {
      phone_number: params.phoneNumber.replace(/^\+/, ''),
      phone_code: this.phoneCode,
      list_id: listId,
      first_name: params.firstName ?? '',
      last_name: params.lastName ?? '',
      vendor_lead_code: params.externalKey ?? '',
    });
  }

  /** UNTESTED: function=external_pause — pause/resume the agent session. */
  async setAgentPaused(paused: boolean, agentUser?: string): Promise<void> {
    await this.callApi('external_pause', {
      agent_user: agentUser || this.defaultAgentUser,
      value: paused ? 'PAUSE' : 'RESUME',
    });
  }
}
