import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Collections | Settle In Peace',
  description: 'Collections workspace for Settle In Peace.',
  robots: { index: false, follow: false },
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
