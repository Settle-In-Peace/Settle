import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | Settle In Peace',
  description: 'Set a new Settle In Peace account password.',
  robots: { index: false, follow: false },
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
