import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import Stripe from 'stripe';
import { CloseFlowStore } from './store';
import { CloseFlowNotify } from './notify.service';
import { scoreLead } from './si-score';
import {
  DEFAULT_NURTURE_STEPS,
  resolveOffer,
  type CloseFlowSiteConfig,
  type CloseLeadInput,
  type NurtureRow,
  type NurtureStep,
} from './close-flow.types';
import { firstNameOf, renderBadFit, renderPaidConfirm, renderStep } from './close-flow.templates';

/**
 * Per-site hooks — optional provider token 'CLOSE_FLOW_HOOKS'.
 * onPaid fires after a nurture row flips to paid (flip the lead / unlock the
 * resource); onException is a heads-up for the site's own alerting on top of
 * the built-in owner alert.
 */
export interface CloseFlowHooks {
  onPaid?(row: NurtureRow, session: Stripe.Checkout.Session): Promise<void> | void;
  onException?(where: string, err: unknown, row?: NurtureRow): Promise<void> | void;
}
export const CLOSE_FLOW_HOOKS = 'CLOSE_FLOW_HOOKS';

export interface IntakeResult {
  action: 'ready_to_pay' | 'nurture' | 'bad_fit';
  score: number;
  grade: string;
  sequenceId: string;
  checkoutUrl?: string;
}

const SWEEP_MS = () => Number(process.env.CLOSE_FLOW_SWEEP_MS) || 15 * 60 * 1000;
const SWEEP_BATCH = 50;

/** Minimal E.164-ish normalize (self-contained — sites with libphonenumber
 *  should pre-normalize at their write boundary). */
function e164(phone?: string | null): string | null {
  if (!phone) return null;
  const p = phone.trim();
  if (p.startsWith('+')) return p;
  const digits = p.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 10 ? `+${digits}` : null;
}

@Injectable()
export class CloseFlowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloseFlowService.name);
  private timer?: NodeJS.Timeout;
  private stripe?: Stripe;

  constructor(
    private readonly store: CloseFlowStore,
    private readonly notify: CloseFlowNotify,
    @Optional() @Inject(CLOSE_FLOW_HOOKS) private readonly hooks?: CloseFlowHooks,
  ) {}

  onModuleInit() {
    // setInterval sweep — same pattern settle-api's NurtureService uses;
    // no @nestjs/schedule dependency so the module ports everywhere.
    if (process.env.CLOSE_FLOW_SWEEP_DISABLED === '1') return;
    this.timer = setInterval(() => {
      this.sweep().catch((e) => this.logger.error(`sweep failed: ${e?.message || e}`));
    }, SWEEP_MS());
    this.timer.unref?.();
    this.logger.log(`close-flow sweep armed every ${SWEEP_MS() / 60000}min`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private stripeClient(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    if (!this.stripe) this.stripe = new Stripe(key);
    return this.stripe;
  }

  // ── Intake → score → branch ──────────────────────────────────────────

  async intake(lead: CloseLeadInput, cfg: CloseFlowSiteConfig): Promise<IntakeResult> {
    const name =
      lead.name?.trim() ||
      [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() ||
      undefined;
    const scored = scoreLead(
      {
        email: lead.email,
        phone: lead.phone,
        name,
        zip: lead.zip,
        budgetCents: lead.budgetCents,
        budgetText: lead.budgetText,
        vertical: lead.vertical,
        message: lead.message,
        details: lead.details,
        waitlist: lead.waitlist,
      },
      {
        serviceZipPrefixes: cfg.serviceZipPrefixes,
        serviceAreaLabel: cfg.serviceAreaLabel,
        minBudgetCents: cfg.minBudgetCents,
      },
    );

    const steps = cfg.nurtureSteps?.length ? cfg.nurtureSteps : DEFAULT_NURTURE_STEPS;
    const offer = resolveOffer(lead.vertical, cfg);
    const row = await this.store.insert({
      site: cfg.site,
      leadRef: lead.leadRef ?? null,
      email: lead.email?.toLowerCase() ?? null,
      phone: e164(lead.phone),
      name: name ?? null,
      vertical: lead.vertical ?? null,
      offer: offer?.offerKey ?? null,
      status: 'active',
      stepIndex: 0,
      score: scored.score,
      grade: scored.grade,
      reasons: scored.reasons,
      amountCents: offer?.priceCents ?? null,
    });

    const ctx = { row, cfg, firstName: firstNameOf(row) };

    if (scored.action === 'bad_fit') {
      const msg = renderBadFit(ctx);
      if (row.email) await this.notify.sendEmail(row.email, msg.subject, msg.html);
      await this.store.update(row.id, { status: 'closed_bad_fit', nextSendAt: null });
      return { action: 'bad_fit', score: scored.score, grade: scored.grade, sequenceId: row.id };
    }

    // ready_to_pay → build the checkout link NOW so step-0 carries it.
    // alwaysCheckout sites also link 'nurture' leads (hard paywall funnels).
    if ((scored.action === 'ready_to_pay' || cfg.alwaysCheckout) && offer) {
      try {
        const session = await this.createCheckout(offer, row, cfg, lead.email);
        await this.store.update(row.id, {
          checkoutUrl: session.url ?? null,
          stripeSessionId: session.id,
        });
        row.checkoutUrl = session.url;
        row.stripeSessionId = session.id;
      } catch (e) {
        await this.fail(row, 'checkout_create', e);
      }
    }

    // Step 0 fires immediately (the "confirm" touch, with the link when we
    // have one) — later steps ride the sweep.
    await this.sendStep(row, steps[0], ctx);
    const next = steps[1];
    await this.store.update(row.id, {
      stepIndex: 1,
      nextSendAt: next ? new Date(Date.now() + next.afterMinutes * 60_000) : null,
      status: next ? 'active' : row.checkoutUrl ? 'active' : 'expired',
    });

    return {
      action: scored.action,
      score: scored.score,
      grade: scored.grade,
      sequenceId: row.id,
      checkoutUrl: row.checkoutUrl ?? undefined,
    };
  }

  /**
   * Re-issue (or reuse) the checkout for a lead's active sequence — the
   * "pay now" buttons and nurture links point here instead of stacking a
   * fresh sequence per click. Falls back to a full intake when no active
   * sequence exists.
   */
  async reissue(
    leadRef: string,
    cfg: CloseFlowSiteConfig,
    lead?: Partial<CloseLeadInput>,
  ): Promise<{ checkoutUrl?: string; action: string; sequenceId?: string }> {
    const row = await this.store.latestForLead(cfg.site, leadRef);
    if (row && row.status === 'active') {
      if (row.checkoutUrl) {
        return { checkoutUrl: row.checkoutUrl, action: 'existing', sequenceId: row.id };
      }
      const offer = resolveOffer(row.vertical ?? lead?.vertical, cfg);
      if (offer) {
        try {
          const session = await this.createCheckout(offer, row, cfg, row.email ?? lead?.email);
          await this.store.update(row.id, {
            checkoutUrl: session.url ?? null,
            stripeSessionId: session.id,
          });
          return { checkoutUrl: session.url ?? undefined, action: 'reissued', sequenceId: row.id };
        } catch (e) {
          await this.fail(row, 'checkout_reissue', e);
          return { action: 'error', sequenceId: row.id };
        }
      }
      return { action: 'no_offer', sequenceId: row.id };
    }
    // No active sequence — run the normal intake (creates row + step-0).
    const res = await this.intake({ ...(lead ?? {}), leadRef } as CloseLeadInput, cfg);
    return { checkoutUrl: res.checkoutUrl, action: res.action, sequenceId: res.sequenceId };
  }

  private async createCheckout(
    offer: NonNullable<ReturnType<typeof resolveOffer>>,
    row: NurtureRow,
    cfg: CloseFlowSiteConfig,
    customerEmail?: string,
  ): Promise<Stripe.Checkout.Session> {
    const stripe = this.stripeClient();
    if (!stripe) throw new Error('STRIPE_SECRET_KEY not configured');
    if (!offer.priceId && !offer.priceCents) throw new Error('offer has no price');

    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = offer.priceId
      ? { price: offer.priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: offer.priceCents!,
            product_data: { name: offer.productName },
          },
        };

    return stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail || undefined,
      line_items: [lineItem],
      metadata: { close_flow: '1', seq: row.id, site: cfg.site, offer: offer.offerKey },
      payment_intent_data: {
        metadata: { close_flow: '1', seq: row.id, site: cfg.site, offer: offer.offerKey },
      },
      success_url: cfg.successUrl.replace('{seq}', row.id),
      cancel_url: cfg.cancelUrl.replace('{seq}', row.id),
    });
  }

  private async sendStep(row: NurtureRow, step: NurtureStep, ctx?: {
    row: NurtureRow;
    cfg: CloseFlowSiteConfig;
    firstName: string;
  }) {
    // sweep callers pass a fresh ctx built with the site's cfg; intake does too.
    if (!ctx) return;
    const msg = renderStep(step, ctx);
    if ((step.channel === 'sms' || step.channel === 'both') && row.phone && msg.sms) {
      const r = await this.notify.sendSms(row.phone, msg.sms);
      if (!r.ok && !r.skipped) await this.fail(row, 'sms_send', new Error('telnyx send failed'));
    }
    if ((step.channel === 'email' || step.channel === 'both') && row.email && msg.html) {
      const r = await this.notify.sendEmail(row.email, msg.subject!, msg.html);
      if (!r.ok && !r.skipped) await this.fail(row, 'email_send', new Error('resend send failed'));
    }
  }

  // ── Sweep — walk queued steps until paid / expired ───────────────────

  async sweep() {
    const due = await this.store.due(new Date(), SWEEP_BATCH);
    for (const row of due) {
      try {
        const cfg = this.siteConfigFor(row.site);
        if (!cfg) continue;
        const steps = cfg.nurtureSteps?.length ? cfg.nurtureSteps : DEFAULT_NURTURE_STEPS;
        const step = steps[row.stepIndex];
        if (!step) {
          await this.store.update(row.id, { status: 'expired', nextSendAt: null });
          continue;
        }
        await this.sendStep(row, step, { row, cfg, firstName: firstNameOf(row) });
        const next = steps[row.stepIndex + 1];
        await this.store.update(row.id, {
          stepIndex: row.stepIndex + 1,
          nextSendAt: next
            ? new Date(Date.now() + next.afterMinutes * 60_000)
            : null,
          ...(next ? {} : { status: 'expired' as const }),
        });
      } catch (e) {
        await this.fail(row, 'sweep_step', e);
      }
    }
  }

  /** Site configs registered by the module — see closeFlowSites() below. */
  private siteConfigFor(site: string): CloseFlowSiteConfig | undefined {
    return CloseFlowService.siteConfigs.get(site);
  }
  private static siteConfigs = new Map<string, CloseFlowSiteConfig>();
  static registerSite(cfg: CloseFlowSiteConfig) {
    CloseFlowService.siteConfigs.set(cfg.site, cfg);
  }

  // ── Stripe fulfillment (existing webhook fan-outs call this) ─────────

  /** Returns true when the session was a close-flow checkout (handled). */
  async fulfillSession(session: Stripe.Checkout.Session): Promise<boolean> {
    if (session.metadata?.close_flow !== '1' && !session.metadata?.seq) return false;

    const row =
      (await this.store.byStripeSession(session.id)) ||
      (session.metadata?.seq ? await this.store.byId(session.metadata.seq) : null);
    if (!row) {
      this.logger.warn(`close_flow session ${session.id} matched no nurture row`);
      return true;
    }
    if (row.status === 'paid') return true; // idempotent — Stripe retries

    const amountCents = session.amount_total ?? row.amountCents ?? null;
    await this.store.update(row.id, {
      status: 'paid',
      paidAt: new Date(),
      amountCents,
      nextSendAt: null,
      stripeSessionId: row.stripeSessionId ?? session.id,
    });
    const paid = { ...row, status: 'paid' as const, amountCents, paidAt: new Date() };

    // Customer receipt
    const cfg = this.siteConfigFor(row.site);
    if (cfg) {
      const ctx = { row: paid, cfg, firstName: firstNameOf(paid) };
      const msg = renderPaidConfirm(ctx);
      if (paid.email) await this.notify.sendEmail(paid.email, msg.subject, msg.html);
      if (paid.phone && msg.sms) await this.notify.sendSms(paid.phone, msg.sms);
    }

    // Site hook (flip lead / unlock resource)
    try {
      await this.hooks?.onPaid?.(paid, session);
    } catch (e) {
      await this.fail(paid, 'on_paid_hook', e);
    }

    // Owner alert — money event.
    await this.alertOwner(
      `💰 ${cfg?.brand ?? row.site}: ${row.offer || 'payment'} ${amountCents ? `$${(amountCents / 100).toFixed(2)}` : 'paid'}`,
      `Close-flow payment received.\n` +
        `Site: ${row.site}\nOffer: ${row.offer ?? '-'}\nAmount: ${amountCents ? `$${(amountCents / 100).toFixed(2)}` : 'n/a'}\n` +
        `Customer: ${row.name ?? '-'} <${row.email ?? '-'}> ${row.phone ?? '-'}\n` +
        `Lead: ${row.leadRef ?? '-'} · Sequence: ${row.id}\nStripe session: ${session.id}`,
    );
    return true;
  }

  private async byId(id: string): Promise<NurtureRow | null> {
    return this.store.byId(id);
  }

  // ── Pipeline + alerts ────────────────────────────────────────────────

  async pipeline(site?: string) {
    const counts = await this.store.countsByStatus(site);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { site: site ?? 'all', total, byStatus: counts };
  }

  /** Owner alert — fired ONLY on money events and exceptions. */
  async alertOwner(subject: string, text: string) {
    const email = process.env.OWNER_ALERT_EMAIL;
    const phone = process.env.OWNER_ALERT_PHONE;
    if (email) {
      await this.notify.sendEmail(
        email,
        subject,
        `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre>`,
      );
    }
    if (phone) {
      await this.notify.sendSms(phone, `${subject}\n${text}`.slice(0, 1500));
    }
    if (!email && !phone) this.logger.warn('owner alert dropped — OWNER_ALERT_EMAIL/PHONE unset');
  }

  private async fail(row: NurtureRow, where: string, err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.error(`close-flow ${where} failed (seq ${row.id}): ${msg}`);
    await this.store.update(row.id, { lastError: `${where}: ${msg}`.slice(0, 1000) });
    try {
      await this.hooks?.onException?.(where, err, row);
    } catch {
      /* hook must not throw */
    }
    await this.alertOwner(
      `⚠️ ${row.site}: close-flow ${where} failed`,
      `Exception in close-flow.\nWhere: ${where}\nError: ${msg}\n` +
        `Seq: ${row.id}\nCustomer: ${row.email ?? '-'} ${row.phone ?? '-'}\nLead: ${row.leadRef ?? '-'}`,
    );
  }
}
