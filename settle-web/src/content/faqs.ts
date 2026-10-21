// FAQ content for the Settle In Peace FAQ section (/faq).
// Categorized questions with expandable answers and Schema.org FAQPage markup.

export interface FAQ {
  question: string;
  answer: string;
}

export interface FAQCategory {
  id: string;
  name: string;
  description: string;
  faqs: FAQ[];
}

export const faqCategories: FAQCategory[] = [
  // ---------------------------------------------------------------
  // General
  // ---------------------------------------------------------------
  {
    id: 'general',
    name: 'General',
    description: 'The basics about Settle In Peace and how our marketplace works.',
    faqs: [
      {
        question: 'What is Settle In Peace?',
        answer:
          'Settle In Peace is a marketplace that connects consumers struggling with debt to third-party debt relief providers. We are not a debt settlement company ourselves — instead, we let you compare multiple providers side-by-side — fees, timelines, and savings estimates — so you can choose the right path with no pressure.',
      },
      {
        question: 'Is Settle In Peace a debt settlement company?',
        answer:
          'No. We are a marketplace and comparison platform, not a direct debt settlement provider. We connect you with third-party debt relief companies and help you compare their offers. We receive compensation from partner providers, which we disclose openly.',
      },
      {
        question: 'Is the assessment really free?',
        answer:
          'Yes. The 2-minute assessment is completely free with no obligation and no credit check. You only share basic information about your debt situation to get matched with providers who can help. You are never required to enroll with any provider.',
      },
      {
        question: 'Which states do you serve?',
        answer:
          'We operate as a marketplace nationwide, but the debt relief providers in our network are licensed state-by-state. Some providers are not available in every state, and a few states restrict for-profit debt settlement. Your assessment results will only show providers licensed in your state.',
      },
      {
        question: 'Will using Settle In Peace affect my credit score?',
        answer:
          'Simply using our site and taking the assessment does not affect your credit — we do not perform a credit check. However, the debt relief options we connect you to (particularly debt settlement) can impact your credit. The credit impact of each option is disclosed so you can decide with full information.',
      },
    ],
  },

  // ---------------------------------------------------------------
  // Debt Settlement
  // ---------------------------------------------------------------
  {
    id: 'debt-settlement',
    name: 'Debt Settlement',
    description: 'How debt settlement works, what it covers, and what to expect.',
    faqs: [
      {
        question: 'What types of debt can be settled?',
        answer:
          'Debt settlement works for unsecured debts: credit cards, medical bills, personal loans, private student loans, and some business debts. It does not work for secured debts (mortgages, auto loans) or federal student loans. Most programs require a minimum of $7,500 to $10,000 in eligible unsecured debt.',
      },
      {
        question: 'How much can I save through debt settlement?',
        answer:
          'According to the American Fair Credit Council, debt settlement programs typically reduce enrolled debt by 40% to 60% before fees. After accounting for company fees (15% to 25%), net savings are often 20% to 40% of the enrolled debt. Your actual results depend on your creditors, how far behind you are, and how much you can save each month.',
      },
      {
        question: 'How long does debt settlement take?',
        answer:
          'Most debt settlement programs run 24 to 48 months. The timeline depends on how much debt you have, how much you can set aside each month, and how quickly your creditors agree to settle. Faster programs mean higher monthly savings requirements.',
      },
      {
        question: 'Do I have to stop paying my creditors?',
        answer:
          'Yes, in most cases. Debt settlement requires you to fall behind on payments so creditors have an incentive to negotiate. This is why settlement hurts your credit. If you are current on payments and want to protect your credit, debt consolidation or a debt management plan may be a better fit.',
      },
      {
        question: 'Can creditors still sue me during debt settlement?',
        answer:
          'Yes. Unlike bankruptcy, debt settlement does not have the legal protection of an automatic stay. Creditors can sue you while you are in a settlement program, though many prefer to negotiate rather than pursue litigation. A reputable provider will discuss this risk with you upfront.',
      },
    ],
  },

  // ---------------------------------------------------------------
  // Credit Impact
  // ---------------------------------------------------------------
  {
    id: 'credit-impact',
    name: 'Credit Impact',
    description: 'How debt relief options affect your credit score and how to recover.',
    faqs: [
      {
        question: 'How much will debt settlement hurt my credit score?',
        answer:
          'The impact depends on your starting score. If you have excellent credit (760+), expect a drop of 100 to 160 points. If you have fair credit (620-680), expect 60 to 100 points. If you are already behind on payments, the additional damage is smaller because missed payments have already lowered your score.',
      },
      {
        question: 'How long does a settled debt stay on my credit report?',
        answer:
          'A settled account remains on your credit report for 7 years from the date of the original delinquency. After that, it falls off automatically. The negative impact fades over time, and most people see meaningful recovery within 12 to 24 months of completing their program.',
      },
      {
        question: 'Can I rebuild my credit after debt settlement?',
        answer:
          'Yes, absolutely. Credit rebuilding is very doable. The key steps are: get a secured credit card, keep utilization under 10%, pay every bill on time, and consider a credit-builder loan or becoming an authorized user. Most people reach the 700+ range within 3 to 5 years of completing settlement.',
      },
      {
        question: 'Is debt settlement worse than bankruptcy for my credit?',
        answer:
          'Not necessarily. A Chapter 7 bankruptcy stays on your report for 10 years; a Chapter 13 for 7 years. Settled accounts stay for 7 years. Counterintuitively, some people recover credit faster after bankruptcy because it resolves all debts at once. The right choice depends on your full financial picture.',
      },
    ],
  },

  // ---------------------------------------------------------------
  // Taxes
  // ---------------------------------------------------------------
  {
    id: 'taxes',
    name: 'Taxes',
    description: 'The tax implications of forgiven debt and how to prepare.',
    faqs: [
      {
        question: 'Is forgiven debt taxable?',
        answer:
          'Generally yes. If a creditor forgives $600 or more of your debt, the IRS considers that forgiven amount taxable income. The creditor will send you a Form 1099-C, and you must report it on your tax return. Set aside roughly 20% to 25% of the forgiven amount to cover the tax bill.',
      },
      {
        question: 'What is the insolvency exclusion?',
        answer:
          'If your total debts exceeded the fair market value of your assets immediately before the debt was cancelled, you may be able to exclude the forgiven amount from your income (up to the amount by which you were insolvent). You claim this using IRS Form 982. Many people in debt settlement qualify for this exclusion.',
      },
      {
        question: 'Will I get a 1099-C from every settled debt?',
        answer:
          'You will receive a Form 1099-C from any creditor that forgives $600 or more. If a forgiven amount is under $600, the creditor is not required to send a 1099-C, though the forgiven amount may still technically be taxable income. Keep records of all settlements for tax time.',
      },
      {
        question: 'Should I talk to a tax professional before settling debt?',
        answer:
          'Yes, strongly recommended. Tax rules around forgiven debt are complex and depend on your specific financial situation. A tax professional can help you determine if you qualify for the insolvency exclusion, estimate your tax liability, and plan accordingly. This is one area where professional advice pays for itself.',
      },
    ],
  },

  // ---------------------------------------------------------------
  // Process
  // ---------------------------------------------------------------
  {
    id: 'process',
    name: 'Process',
    description: 'What happens when you enroll and work through a debt relief program.',
    faqs: [
      {
        question: 'What happens after I complete the assessment?',
        answer:
          'After you complete the free assessment, we match your profile with debt relief providers serving your state. You can then compare their offers — fees, timelines, estimated savings — side by side. You choose whether and when to contact a provider. There is no obligation and no pressure.',
      },
      {
        question: 'How do I enroll with a debt relief provider?',
        answer:
          'Once you have compared providers and chosen one, you contact them directly to enroll. They will walk you through their specific program, fees, and contract. Settle In Peace does not enroll you — we connect you and provide the comparison. Always read the contract carefully before signing.',
      },
      {
        question: 'What is a dedicated savings account?',
        answer:
          'In a debt settlement program, you set aside money each month into a dedicated savings account (sometimes called a special purpose account) that you own and control. This money builds up to fund settlement offers. Legitimate programs have you save into your own account — never pay the company directly instead of your creditors.',
      },
      {
        question: 'How are settlements negotiated?',
        answer:
          'Once you have saved enough in your dedicated account, the settlement company (or you, if doing it yourself) contacts the creditor with a lump-sum offer, typically 40% to 60% of the balance. If the creditor accepts, you pay the agreed amount from your savings account and the account is settled. This repeats for each enrolled debt.',
      },
      {
        question: 'What if a creditor refuses to settle?',
        answer:
          'Creditors are not required to negotiate. If one refuses, the settlement company will typically keep trying as your account becomes more delinquent (which increases their incentive to settle). In some cases, a creditor may sue instead. A reputable provider discusses this risk with you before you enroll.',
      },
    ],
  },

  // ---------------------------------------------------------------
  // Pricing
  // ---------------------------------------------------------------
  {
    id: 'pricing',
    name: 'Pricing',
    description: 'How debt relief providers charge and what you should expect to pay.',
    faqs: [
      {
        question: 'How much does debt settlement cost?',
        answer:
          'Reputable debt settlement companies charge fees of 15% to 25% of either your enrolled debt or the amount saved, depending on the company and state. Federal law prohibits them from charging upfront fees — they can only charge you after a debt has been successfully settled. Always confirm the fee structure in writing before enrolling.',
      },
      {
        question: 'Does Settle In Peace charge me anything?',
        answer:
          'No. Using our marketplace and taking the assessment is completely free for consumers. We are compensated by our partner providers, not by you. We disclose this openly. You never pay Settle In Peace anything.',
      },
      {
        question: 'Is it cheaper to settle debt myself?',
        answer:
          'Yes, doing it yourself saves you the company fees — you keep 100% of the savings. The trade-off is your time, effort, and comfort with negotiation. If you have the discipline and willingness to negotiate directly with creditors, DIY settlement can save thousands in fees. Our blog has a step-by-step guide to negotiating with creditors yourself.',
      },
      {
        question: 'Why do some companies charge upfront fees?',
        answer:
          'They should not — it is illegal under the FTC Telemarketing Sales Rule for for-profit debt settlement companies to charge upfront fees before settling a debt. If a company asks for money before delivering results, it is a red flag and likely a scam. Walk away and report them to the FTC.',
      },
    ],
  },
];

// Flat list of all FAQs (used for Schema.org FAQPage markup)
export const allFaqs: FAQ[] = faqCategories.flatMap(c => c.faqs);

export const totalFaqCount = allFaqs.length;
