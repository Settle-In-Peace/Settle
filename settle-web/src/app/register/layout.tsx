import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create a Free Account | Settle In Peace',
  description: 'Create a free Settle In Peace account to save your assessment results and compare debt relief providers.',
  alternates: { canonical: '/register' },
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
