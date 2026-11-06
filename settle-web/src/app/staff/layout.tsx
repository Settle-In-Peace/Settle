import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staff | Settle In Peace',
  description: 'Settle In Peace staff access.',
  robots: { index: false, follow: false },
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
