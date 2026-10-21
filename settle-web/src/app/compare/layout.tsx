import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare Debt Relief Providers | Settle In Peace',
  description: 'Compare debt relief providers, fees, ratings, and services in one place.',
  alternates: { canonical: '/compare' },
};

export default function CompareLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
