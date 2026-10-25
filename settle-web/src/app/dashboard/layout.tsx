import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Dashboard | Settle In Peace', description: 'View your Settle In Peace account dashboard.', robots: { index: false, follow: false } };
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
