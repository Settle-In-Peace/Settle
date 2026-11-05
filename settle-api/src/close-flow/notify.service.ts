import { Injectable, Logger } from '@nestjs/common';

/**
 * Close-flow notifier — talks to Telnyx (SMS) + Resend (email) over plain
 * fetch so the module has zero extra deps and ports verbatim to every api.
 * Degrades gracefully: when a provider isn't configured the send is logged
 * and reported as skipped (never throws — a notify failure must not break
 * intake or webhook fulfillment).
 */
@Injectable()
export class CloseFlowNotify {
  private readonly logger = new Logger(CloseFlowNotify.name);

  async sendSms(to: string, text: string): Promise<{ ok: boolean; id?: string; skipped?: boolean }> {
    const apiKey = process.env.TELNYX_API_KEY;
    const from =
      process.env.TELNYX_FROM_NUMBER ||
      process.env.TELNYX_PHONE_NUMBER;
    if (!apiKey || !from) {
      this.logger.warn(`SMS skipped (Telnyx not configured) → ${to}`);
      return { ok: false, skipped: true };
    }
    try {
      const body: Record<string, unknown> = { from, to, text };
      const profile = process.env.TELNYX_MESSAGING_PROFILE_ID;
      if (profile) body.messaging_profile_id = profile;
      const res = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(`Telnyx ${res.status}: ${JSON.stringify(data?.errors ?? data).slice(0, 300)}`);
        return { ok: false };
      }
      return { ok: true, id: data?.data?.id };
    } catch (e: any) {
      this.logger.error(`SMS send failed: ${e?.message || e}`);
      return { ok: false };
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    fromOverride?: string,
  ): Promise<{ ok: boolean; id?: string; skipped?: boolean }> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = fromOverride || process.env.EMAIL_FROM || process.env.RESEND_FROM;
    if (!apiKey || !from) {
      this.logger.warn(`Email skipped (Resend not configured) → ${to}`);
      return { ok: false, skipped: true };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(`Resend ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
        return { ok: false };
      }
      return { ok: true, id: data?.id };
    } catch (e: any) {
      this.logger.error(`Email send failed: ${e?.message || e}`);
      return { ok: false };
    }
  }
}
