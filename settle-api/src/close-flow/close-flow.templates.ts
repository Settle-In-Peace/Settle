import type { NurtureRow, NurtureStep, CloseFlowSiteConfig } from './close-flow.types';

/** Render context handed to every template. */
export interface TemplateCtx {
  row: NurtureRow;
  cfg: CloseFlowSiteConfig;
  /** First name fallback chain → 'there'. */
  firstName: string;
}

function money(cents?: number | null): string {
  return cents != null ? `$${(cents / 100).toFixed(0)}` : '';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function firstNameOf(row: NurtureRow): string {
  const n = (row.name || '').trim().split(/\s+/)[0];
  return n || 'there';
}

function wrap(brand: string, inner: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">` +
    inner +
    `<p style="margin-top:28px;font-size:12px;color:#64748b">— ${esc(brand)}</p></div>`;
}

function cta(url: string, label: string): string {
  return (
    `<p style="margin:20px 0"><a href="${url}" ` +
    `style="background:#003399;color:#fff;padding:12px 22px;border-radius:8px;` +
    `text-decoration:none;font-weight:600;display:inline-block">${esc(label)}</a></p>`
  );
}

export interface RenderedStep {
  sms?: string;
  subject?: string;
  html?: string;
}

/** Message bodies for each nurture step. Keep the checkout URL in EVERY
 *  message — the whole point is a self-serve close, not "we'll call". */
export function renderStep(step: NurtureStep, ctx: TemplateCtx): RenderedStep {
  const { row, cfg, firstName } = ctx;
  const link = row.checkoutUrl || cfg.cancelUrl;
  const price = money(row.amountCents);

  switch (step.template) {
    case 'confirm': {
      const sms = link
        ? `${cfg.brand}: Hi ${firstName}, you're all set — lock in your ${row.offer || 'spot'} here (${price}): ${link}`
        : `${cfg.brand}: Hi ${firstName}, we got your info — we'll follow up shortly.`;
      const subject = `${cfg.brand} — your next step`;
      const html = wrap(
        cfg.brand,
        `<p>Hi ${esc(firstName)},</p>` +
          `<p>Thanks for reaching out to ${esc(cfg.brand)}.` +
          (link
            ? ` You can skip the wait and finish right now — it takes about a minute:`
            : ` We'll be in touch shortly.`) +
          `</p>` +
          (link ? cta(link, `Finish now${price ? ` — ${price}` : ''}`) : ''),
      );
      return { sms, subject, html };
    }
    case 'value': {
      const subject = `${cfg.brand} — why it's worth ${price || 'it'}`;
      const html = wrap(
        cfg.brand,
        `<p>Hi ${esc(firstName)},</p>` +
          `<p>Quick note — your ${esc(row.offer || 'request')} is ready. ` +
          `Finishing now puts you at the front of the line instead of waiting on a callback.</p>` +
          (link ? cta(link, 'Complete it now') : ''),
      );
      // Email-only step by default.
      const sms =
        step.channel !== 'email'
          ? `${cfg.brand}: still holding your ${row.offer || 'spot'}, ${firstName}. Finish here: ${link}`
          : undefined;
      return { sms, subject, html };
    }
    case 'last_chance': {
      const sms = link
        ? `${cfg.brand}: last call, ${firstName} — your ${row.offer || 'offer'} expires soon. ${link}`
        : `${cfg.brand}: last call, ${firstName} — reply if you're still interested.`;
      const subject = `${cfg.brand} — last call`;
      const html = wrap(
        cfg.brand,
        `<p>Hi ${esc(firstName)},</p>` +
          `<p>This is the last reminder — after this we close out your request so ` +
          `someone else can take the slot.</p>` +
          (link ? cta(link, 'Claim it before it expires') : ''),
      );
      return { sms, subject, html };
    }
  }
}

/** Polite close for bad-fit / out-of-area leads. */
export function renderBadFit(ctx: TemplateCtx): { subject: string; html: string } {
  const { row, cfg, firstName } = ctx;
  const area = cfg.serviceAreaLabel ? ` in ${cfg.serviceAreaLabel}` : '';
  return {
    subject: `${cfg.brand} — thanks for reaching out`,
    html: wrap(
      cfg.brand,
      `<p>Hi ${esc(firstName)},</p>` +
        `<p>Thanks for contacting ${esc(cfg.brand)}. Right now we can't take on ` +
        `your ${esc(row.offer || 'request')}${area}, but we've saved your details ` +
        `and will reach out the moment that changes.</p>`,
    ),
  };
}

/** Receipt after a completed checkout. */
export function renderPaidConfirm(ctx: TemplateCtx): { sms?: string; subject: string; html: string } {
  const { row, cfg, firstName } = ctx;
  return {
    sms: `${cfg.brand}: payment received — you're confirmed, ${firstName}. We'll take it from here.`,
    subject: `${cfg.brand} — payment confirmed`,
    html: wrap(
      cfg.brand,
      `<p>Hi ${esc(firstName)},</p>` +
        `<p>Payment received — you're confirmed${row.amountCents ? ` (${money(row.amountCents)})` : ''}. ` +
        `We'll take it from here and follow up with next steps shortly.</p>`,
    ),
  };
}
