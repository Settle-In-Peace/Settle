/**
 * Affiliate partner offers shown on the compare marketplace.
 * Links are tracked via our affiliate program accounts:
 *  - CuraDebt: direct partner portal (code SETTLE) — $50/debt PPL lead
 *  - Community Tax: Awin (publisher 3120855) — from $100/sale
 *  - SmartCredit: ConsumerDirect partner (PID 57216) — monthly commissions
 * Every outbound link must keep rel="sponsored nofollow noopener" (FTC).
 */
export interface PartnerOffer {
  id: string;
  name: string;
  vertical: 'debt' | 'tax' | 'credit';
  tag: string;
  blurb: string;
  cta: string;
  url: string;
  /** Required by the partner: identifies who actually provides the service. */
  providerLine?: string;
  /** Required by the partner: eligibility/terms disclaimer next to the widget. */
  disclaimer?: string;
}

export const PARTNER_OFFERS: PartnerOffer[] = [
  {
    id: 'curadebt',
    name: 'CuraDebt',
    vertical: 'debt',
    tag: 'Debt Relief',
    blurb:
      'Free, no-obligation evaluation for consumers carrying $10,000+ in unsecured debt. Explore settlement options that may reduce what you owe.',
    cta: 'Explore Options',
    url: 'https://lp.curadebt.com/lp/see-debt-relief-options?utm_source=SETTLE&utm_medium=affiliate&utm_campaign=debt_ppl',
    providerLine:
      'Debt relief services are provided by CuraDebt Systems, LLC, a third-party company. Settle In Peace is a comparison marketplace — not a debt relief provider.',
    disclaimer:
      'CuraDebt works with unsecured debts such as credit cards, medical bills, and personal loans. Federal student loans, mortgages, auto loans, and other secured debts are not eligible. Not available in all states; eligibility and results vary. Debt settlement may negatively affect your credit score, and forgiven debt may be taxable. Fees are charged only on debts enrolled in and settled through the program.',
  },
  {
    id: 'community-tax',
    name: 'Community Tax',
    vertical: 'tax',
    tag: 'Tax Relief',
    blurb:
      'Behind on IRS or state taxes? Review resolution options for $10,000+ in tax debt with a free consultation.',
    cta: 'See Tax Relief Options',
    url: 'https://www.awin1.com/awclick.php?mid=130537&id=3120855',
  },
  {
    id: 'smartcredit',
    name: 'SmartCredit',
    vertical: 'credit',
    tag: 'Credit Monitoring',
    blurb:
      'Track your credit score and monitor changes while you work through a debt relief plan.',
    cta: 'Check My Score',
    url: 'https://www.smartcredit.com/join/?pid=57216',
  },
];
