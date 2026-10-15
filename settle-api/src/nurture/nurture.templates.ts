import { DebtSnapshot, NurtureSubscriber } from '../entities/nurture-subscriber.entity';

const FRONTEND = () => process.env.FRONTEND_URL || 'https://settleinpeace.com';
const API = () => process.env.PUBLIC_API_URL || 'https://api.settleinpeace.com';

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(body: string, unsubscribeUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
      </div>
      ${body}
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
      <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      <p style="color: #a1a1aa; font-size: 12px;">You're getting this because you asked for your free debt snapshot. <a href="${unsubscribeUrl}" style="color: #a1a1aa;">Unsubscribe</a></p>
    </body>
    </html>
  `;
}

const h2 = (t: string) => `<h2 style="color: #18181b; font-size: 20px;">${t}</h2>`;
const p = (t: string) => `<p style="color: #71717a; font-size: 16px; line-height: 1.6;">${t}</p>`;
const cta = (href: string, label: string) =>
  `<div style="text-align: center; margin: 32px 0;"><a href="${href}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">${label}</a></div>`;
const stat = (label: string, value: string) =>
  `<tr><td style="color:#71717a;padding:6px 0;">${label}</td><td style="color:#18181b;font-weight:600;text-align:right;padding:6px 0;">${value}</td></tr>`;
const li = (t: string) => `<li style="color: #71717a; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">${t}</li>`;

const hi = (s: NurtureSubscriber) => `Hi${s.firstName ? ` ${esc(s.firstName)}` : ''}`;

export interface NurtureEmail {
  subject: string;
  html: string;
}

function day0(s: NurtureSubscriber): NurtureEmail {
  const snap = s.snapshot;
  const rows = snap
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${stat('Total unsecured debt', usd(snap.totalDebt))}
        ${stat('Monthly minimums today', usd(snap.monthlyMinimums))}
        ${snap.payoffMonths ? stat('Time to pay off (minimums only)', `${snap.payoffMonths} months`) : ''}
        ${snap.payoffInterest ? stat('Interest paid along the way', usd(snap.payoffInterest)) : ''}
        ${stat('Est. settlement program cost', usd(snap.estSettlementCost))}
        ${stat('Est. monthly program deposit', usd(snap.estMonthlyDeposit))}
        ${stat('Potential savings', `<span style="color:#059669;">${usd(snap.estSavings)}</span>`)}
      </table>`
    : '';
  return {
    subject: 'Your Debt Snapshot is inside',
    html: layout(
      `
      ${h2('Your Debt Snapshot')}
      ${p(`${hi(s)}, here's the snapshot you generated. Keep this email — the numbers below are your baseline.`)}
      ${rows}
      ${p(`<strong>Read me:</strong> these are estimates, not guarantees. Settlement results depend on your creditors, how much you can set aside monthly, and how long accounts have been delinquent. We'll unpack what drives each number over the next 7 days.`)}
      ${p(`Tomorrow: the federal law most people in debt don't know protects them.`)}
      ${cta(`${FRONTEND()}/debt-snapshot`, 'Re-run your numbers')}
    `,
      unsubUrl(s),
    ),
  };
}

function day1(s: NurtureSubscriber): NurtureEmail {
  return {
    subject: 'Day 1 — The law collectors hope you never read',
    html: layout(
      `
      ${h2('The FDCPA is on your side')}
      ${p(`${hi(s)}, the Fair Debt Collection Practices Act limits what third-party collectors can do. Violations can mean statutory damages — and leverage.`)}
      <ul style="padding-left:20px;">
        ${li('<strong>They can\'t harass you.</strong> No calls before 8am or after 9pm, no threats, no obscene language.')}
        ${li('<strong>You can demand written validation.</strong> Within 30 days of first contact, send a debt-validation letter. They must prove the debt is yours and the amount is right — collection must pause until they do.')}
        ${li('<strong>You can stop the calls.</strong> A written cease-communication letter legally ends phone contact (though the debt itself remains).')}
        ${li('<strong>They can\'t lie.</strong> Misrepresenting the amount, claiming to be attorneys, or threatening arrest are all violations.')}
      </ul>
      ${p(`<strong>Action step:</strong> next collector call — don\'t confirm or pay anything. Say "send me written validation" and hang up. That one sentence changes the power dynamic.`)}
    `,
      unsubUrl(s),
    ),
  };
}

function day2(s: NurtureSubscriber): NurtureEmail {
  const snap = s.snapshot;
  const interestLine =
    snap?.payoffInterest && snap.payoffMonths
      ? ` On your numbers, minimums mean roughly <strong>${usd(snap.payoffInterest)} of interest</strong> over <strong>${snap.payoffMonths} months</strong>.`
      : '';
  return {
    subject: 'Day 2 — Why minimum payments are a trap',
    html: layout(
      `
      ${h2('The minimum-payment treadmill')}
      ${p(`${hi(s)}, minimum payments are engineered to keep you paying longest — typically 1–3% of the balance, barely above the monthly interest.${interestLine}`)}
      ${p(`Every extra dollar above the minimum goes straight to principal. But when minimums already eat the budget, that dollar doesn't exist — which is exactly when settlement or restructuring starts making mathematical sense.`)}
      ${p(`<strong>Action step:</strong> list your debts smallest→largest. If you can free even $50/mo by pausing subscriptions or negotiating a bill, the snowball method might out-run settlement. If not — that's data too.`)}
    `,
      unsubUrl(s),
    ),
  };
}

function day3(s: NurtureSubscriber): NurtureEmail {
  return {
    subject: 'Day 3 — Your four real options, compared honestly',
    html: layout(
      `
      ${h2('Four paths out')}
      ${p(`${hi(s)}, here's the honest menu — no product pitch, just the trade-offs:`)}
      <ul style="padding-left:20px;">
        ${li('<strong>Snowball/avalanche (DIY).</strong> Best credit outcome, but only works if you can pay more than minimums consistently.')}
        ${li('<strong>Credit counseling / DMP.</strong> Nonprofit agency negotiates lower APRs; you repay 100% over 3–5 yrs. Modest credit impact, requires steady income.')}
        ${li('<strong>Debt settlement.</strong> Negotiate balances down (often ~50% before fees). Real savings, but credit takes a hit and forgiven amounts may be taxable.')}
        ${li('<strong>Bankruptcy.</strong> Chapter 7 can discharge unsecured debt entirely — the biggest reset and the biggest credit scar. Worth a consult if debt is truly unpayable.')}
      </ul>
      ${p(`The right answer depends on your numbers, income stability, and timeline — which is exactly what our free assessment maps out.`)}
      ${cta(`${FRONTEND()}/assessment`, 'Take the free assessment')}
    `,
      unsubUrl(s),
    ),
  };
}

function day4(s: NurtureSubscriber): NurtureEmail {
  return {
    subject: 'Day 4 — A word-for-word script for collector calls',
    html: layout(
      `
      ${h2('What to say when they call')}
      ${p(`${hi(s)}, collector calls go badly because people improvise. Use this script verbatim:`)}
      <ul style="padding-left:20px;">
        ${li('"Can you send me written validation of this debt?" — establishes the paper trail.')}
        ${li('"I don\'t discuss finances over the phone." — ends pressure tactics.')}
        ${li('"All communication in writing, please." — invokes your FDCPA right.')}
      </ul>
      ${p(`<strong>Never do these on a call:</strong> admit the debt is yours, agree to a payment, or share bank details. On some debts, acknowledging or paying even $1 can restart the statute of limitations.`)}
      ${p(`Everything that matters happens in writing. If they resist that, it tells you something.`)}
    `,
      unsubUrl(s),
    ),
  };
}

function day5(s: NurtureSubscriber): NurtureEmail {
  return {
    subject: 'Day 5 — The triage budget (10 minutes)',
    html: layout(
      `
      ${h2('Stop the bleeding first')}
      ${p(`${hi(s)}, before optimizing debt, make sure the essentials are covered. The order of operations:`)}
      <ul style="padding-left:20px;">
        ${li('<strong>1. Housing + utilities + food + transport.</strong> Non-negotiable — falling behind here compounds fastest.')}
        ${li('<strong>2. Secured debts.</strong> Car loans, anything with collateral you need.')}
        ${li('<strong>3. Unsecured debts.</strong> Cards, medical, personal loans — last in line by design; they have the least leverage over you.')}
      </ul>
      ${p(`Write down your real monthly surplus after tier 1–2. That number — not a guess — decides whether DIY payoff, a DMP, or settlement is feasible.`)}
      ${p(`<strong>Action step:</strong> calculate your surplus tonight. If it's near zero or negative, that's a clear signal for the next step.`)}
    `,
      unsubUrl(s),
    ),
  };
}

function day6(s: NurtureSubscriber): NurtureEmail {
  return {
    subject: 'Day 6 — Your next step',
    html: layout(
      `
      ${h2('Put the plan in motion')}
      ${p(`${hi(s)}, over the last week you've built the full picture: your numbers, your rights, your options, and your real monthly surplus. The only thing left is deciding.`)}
      ${p(`Our free assessment takes your numbers and matches you with vetted settlement providers — you compare offers, and you're never obligated. If DIY looks better, the week wasn't wasted: you now know your exact baseline and your rights.`)}
      ${cta(`${FRONTEND()}/assessment`, 'Get matched — free assessment')}
      ${p(`Either way, thanks for reading along. You can re-run your snapshot anytime at <a href="${FRONTEND()}/debt-snapshot" style="color:#2563eb;">the calculator</a>.`)}
    `,
      unsubUrl(s),
    ),
  };
}

const STEPS: Array<(s: NurtureSubscriber) => NurtureEmail> = [
  day0,
  day1,
  day2,
  day3,
  day4,
  day5,
  day6,
];

export const NURTURE_STEP_COUNT = STEPS.length;
export const NURTURE_STEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function nurtureEmail(step: number, s: NurtureSubscriber): NurtureEmail | null {
  return STEPS[step]?.(s) ?? null;
}

function unsubUrl(s: NurtureSubscriber): string {
  return `${API()}/nurture/unsubscribe?token=${s.unsubscribeToken}`;
}
