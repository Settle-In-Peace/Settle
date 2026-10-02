import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Lead Vendors | Settle In Peace', description: 'Lead vendor integrations, purchases, and imports.', alternates: { canonical: '/leads' } };
export default function LeadsLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
