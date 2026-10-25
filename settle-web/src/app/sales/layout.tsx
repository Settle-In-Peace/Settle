import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Sales Dashboard | Settle In Peace', description: 'Sales agent dashboard for managing leads.', robots: { index: false, follow: false } };
export default function SalesLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
