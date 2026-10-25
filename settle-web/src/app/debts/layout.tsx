import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'My Debts | Settle In Peace', description: 'Track and organize your debts in one secure place.', robots: { index: false, follow: false } };
export default function DebtsLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
