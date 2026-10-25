import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CRM Command Center | Settle In Peace',
  description: 'All-in-one CRM command center for leads, deals, and pipeline.',
  robots: { index: false, follow: false },
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
