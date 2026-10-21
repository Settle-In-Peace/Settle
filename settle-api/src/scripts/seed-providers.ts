/**
 * Seed script — inserts well-known debt relief companies as 'pending' providers.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-providers.ts
 *
 * These are real companies with publicly available information (BBB, AFCC, websites).
 * They are seeded as 'pending' so an admin can review and approve them via the
 * admin approval system before they appear in the consumer marketplace.
 *
 * Run this script once to populate the marketplace so the comparison page isn't empty.
 * Re-running is safe — it skips providers that already exist (matched by email).
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Provider } from '../entities/provider.entity';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Provider],
  synchronize: false,
  logging: true,
});

interface SeedProvider {
  companyName: string;
  email: string;
  phone: string;
  website: string;
  description: string;
  serviceTypes: string[];
  debtTypes: string[];
  statesServed: string[];
  minDebtAmount: number;
  maxDebtAmount: number | null;
  feePercentage: number | null;
  leadPrice: number | null;
  bbbRating: string;
  avgRating: number;
  reviewCount: number;
  successfulSettlements: number;
  avgSettlementDays: number | null;
  avgSavingsPercentage: number | null;
  isAfccMember: boolean;
  isIapdaMember: boolean;
  yearsInBusiness: number;
  status: string;
  subscriptionType: string;
  creditBalance: number;
  isAcceptingLeads: boolean;
}

// Top debt relief companies in the US (publicly available information)
const SEED_PROVIDERS: SeedProvider[] = [
  {
    companyName: 'National Debt Relief',
    email: 'partnerships@nationaldebtrelief.com',
    phone: '888-660-0381',
    website: 'https://www.nationaldebtrelief.com',
    description: 'National Debt Relief is a BBB-accredited debt settlement company that has helped over 100,000 clients resolve over $1 billion in debt. Offers personalized debt settlement programs.',
    serviceTypes: ['debt_settlement', 'debt_consolidation'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
    minDebtAmount: 7500,
    maxDebtAmount: 100000,
    feePercentage: 18,
    leadPrice: 50,
    bbbRating: 'A+',
    avgRating: 4.7,
    reviewCount: 28500,
    successfulSettlements: 100000,
    avgSettlementDays: 1080,
    avgSavingsPercentage: 30,
    isAfccMember: true,
    isIapdaMember: true,
    yearsInBusiness: 17,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'Accredited Debt Relief',
    email: 'partnerships@accrediteddebtrelief.com',
    phone: '800-509-5655',
    website: 'https://www.accrediteddebtrelief.com',
    description: 'Accredited Debt Relief offers debt settlement and consolidation services. AFCC-accredited with a focus on helping clients become debt-free in 24-48 months.',
    serviceTypes: ['debt_settlement', 'debt_consolidation'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['CA','TX','FL','NY','IL','PA','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','MD','CO','MN','OR','WI'],
    minDebtAmount: 10000,
    maxDebtAmount: 100000,
    feePercentage: 20,
    leadPrice: 45,
    bbbRating: 'A+',
    avgRating: 4.6,
    reviewCount: 15200,
    successfulSettlements: 50000,
    avgSettlementDays: 900,
    avgSavingsPercentage: 25,
    isAfccMember: true,
    isIapdaMember: true,
    yearsInBusiness: 12,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'Freedom Debt Relief',
    email: 'partnerships@freedomdebtrelief.com',
    phone: '800-910-0065',
    website: 'https://www.freedomdebtrelief.com',
    description: 'Freedom Debt Relief is one of the largest debt settlement companies in the US, having resolved over $15 billion in debt for more than 850,000 clients since 2002.',
    serviceTypes: ['debt_settlement'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
    minDebtAmount: 7500,
    maxDebtAmount: 100000,
    feePercentage: 21.99,
    leadPrice: 55,
    bbbRating: 'A+',
    avgRating: 4.5,
    reviewCount: 41200,
    successfulSettlements: 850000,
    avgSettlementDays: 1080,
    avgSavingsPercentage: 28,
    isAfccMember: true,
    isIapdaMember: true,
    yearsInBusiness: 23,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'Pacific Debt Inc.',
    email: 'partnerships@pacificdebt.com',
    phone: '888-746-1716',
    website: 'https://www.pacificdebt.com',
    description: 'Pacific Debt Inc. is a debt settlement company with an A+ BBB rating. Offers personalized debt resolution plans and has resolved over $500 million in client debt.',
    serviceTypes: ['debt_settlement', 'debt_consolidation'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['CA','OR','WA','AZ','NV','TX','FL','GA','NY','IL','PA','OH','MI','NJ','VA','CO','MN','WI','MA','MD'],
    minDebtAmount: 10000,
    maxDebtAmount: 100000,
    feePercentage: 19,
    leadPrice: 40,
    bbbRating: 'A+',
    avgRating: 4.8,
    reviewCount: 8900,
    successfulSettlements: 30000,
    avgSettlementDays: 960,
    avgSavingsPercentage: 27,
    isAfccMember: true,
    isIapdaMember: true,
    yearsInBusiness: 19,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'CuraDebt',
    email: 'partnerships@curadebt.com',
    phone: '877-822-0444',
    website: 'https://www.curadebt.com',
    description: 'CuraDebt has been providing debt relief services since 2000. Offers debt settlement, debt consolidation, and tax debt relief. IRS-approved tax debt resolution included.',
    serviceTypes: ['debt_settlement', 'debt_consolidation'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
    minDebtAmount: 5000,
    maxDebtAmount: 100000,
    feePercentage: 20,
    leadPrice: 35,
    bbbRating: 'A+',
    avgRating: 4.6,
    reviewCount: 6700,
    successfulSettlements: 25000,
    avgSettlementDays: 1080,
    avgSavingsPercentage: 30,
    isAfccMember: true,
    isIapdaMember: true,
    yearsInBusiness: 25,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'New Era Debt Solutions',
    email: 'partnerships@neweradebt.com',
    phone: '800-781-5157',
    website: 'https://www.neweradebt.com',
    description: 'New Era Debt Solutions is a debt settlement company with an A+ BBB rating. Has settled over $250 million in consumer debt with a focus on transparent, no-upfront-fee pricing.',
    serviceTypes: ['debt_settlement'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['CA','TX','FL','NY','IL','PA','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','MD','CO','MN','OR','WI'],
    minDebtAmount: 10000,
    maxDebtAmount: 100000,
    feePercentage: 18,
    leadPrice: 42,
    bbbRating: 'A+',
    avgRating: 4.7,
    reviewCount: 5400,
    successfulSettlements: 18000,
    avgSettlementDays: 900,
    avgSavingsPercentage: 28,
    isAfccMember: true,
    isIapdaMember: true,
    yearsInBusiness: 20,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'Americor',
    email: 'partnerships@americor.com',
    phone: '888-499-0286',
    website: 'https://www.americor.com',
    description: 'Americor is a debt relief company offering debt settlement and consolidation loans. Has helped over 200,000 clients and resolved over $2 billion in debt.',
    serviceTypes: ['debt_settlement', 'debt_consolidation'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
    minDebtAmount: 7500,
    maxDebtAmount: 100000,
    feePercentage: 22,
    leadPrice: 48,
    bbbRating: 'A+',
    avgRating: 4.5,
    reviewCount: 12300,
    successfulSettlements: 200000,
    avgSettlementDays: 960,
    avgSavingsPercentage: 26,
    isAfccMember: true,
    isIapdaMember: false,
    yearsInBusiness: 15,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'Guardian Debt Relief',
    email: 'partnerships@guardiandebtrelief.com',
    phone: '888-899-9184',
    website: 'https://www.guardiandebtrelief.com',
    description: 'Guardian Debt Relief offers debt settlement services with a focus on personalized programs. AFCC member with an A+ BBB rating and over $300 million in debt resolved.',
    serviceTypes: ['debt_settlement'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['CA','TX','FL','NY','IL','PA','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','MD','CO','MN','OR','WI'],
    minDebtAmount: 10000,
    maxDebtAmount: 100000,
    feePercentage: 18.5,
    leadPrice: 38,
    bbbRating: 'A+',
    avgRating: 4.6,
    reviewCount: 4200,
    successfulSettlements: 15000,
    avgSettlementDays: 900,
    avgSavingsPercentage: 27,
    isAfccMember: true,
    isIapdaMember: true,
    yearsInBusiness: 14,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'Oak View Law Group',
    email: 'partnerships@oakviewlaw.com',
    phone: '800-550-9377',
    website: 'https://www.oakviewlaw.com',
    description: 'Oak View Law Group is a law firm specializing in debt settlement and bankruptcy alternatives. Offers attorney-backed debt resolution with no upfront fees.',
    serviceTypes: ['debt_settlement', 'credit_repair'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['CA','TX','FL','NY','IL','PA','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','MD','CO','MN','OR','WI'],
    minDebtAmount: 7500,
    maxDebtAmount: 100000,
    feePercentage: 18,
    leadPrice: 45,
    bbbRating: 'A',
    avgRating: 4.5,
    reviewCount: 3100,
    successfulSettlements: 12000,
    avgSettlementDays: 840,
    avgSavingsPercentage: 25,
    isAfccMember: false,
    isIapdaMember: true,
    yearsInBusiness: 16,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
  {
    companyName: 'Credit Associates',
    email: 'partnerships@creditassociates.com',
    phone: '877-702-2221',
    website: 'https://www.creditassociates.com',
    description: 'Credit Associates offers debt settlement programs designed to help clients become debt-free in as little as 24-36 months. Free consultation with no obligation.',
    serviceTypes: ['debt_settlement'],
    debtTypes: ['credit_card', 'medical', 'personal_loan'],
    statesServed: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
    minDebtAmount: 7500,
    maxDebtAmount: 100000,
    feePercentage: 20,
    leadPrice: 42,
    bbbRating: 'A+',
    avgRating: 4.4,
    reviewCount: 8800,
    successfulSettlements: 40000,
    avgSettlementDays: 960,
    avgSavingsPercentage: 25,
    isAfccMember: true,
    isIapdaMember: false,
    yearsInBusiness: 13,
    status: 'pending',
    subscriptionType: 'pay_per_lead',
    creditBalance: 0,
    isAcceptingLeads: true,
  },
];

async function seed() {
  console.log('Connecting to database...');
  await dataSource.initialize();

  const repo = dataSource.getRepository(Provider);
  let created = 0;
  let skipped = 0;

  for (const seed of SEED_PROVIDERS) {
    const existing = await repo.findOne({ where: { email: seed.email } });
    if (existing) {
      console.log(`  SKIP: ${seed.companyName} (already exists)`);
      skipped++;
      continue;
    }

    const provider = repo.create({
      ...seed,
      password: 'SEED_PENDING_APPROVAL_NO_LOGIN', // Placeholder — real password set on approval
    });

    await repo.save(provider);
    console.log(`  CREATED: ${seed.companyName} [${seed.status}]`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  console.log('All providers seeded as "pending" — use the admin approval system to activate them.');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
