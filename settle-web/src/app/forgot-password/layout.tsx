import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password | Settle In Peace',
  description: 'Reset your Settle In Peace account password.',
  robots: { index: false, follow: false },
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
