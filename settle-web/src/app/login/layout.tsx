import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log In | Settle In Peace',
  description: 'Log in to your Settle In Peace account.',
  robots: { index: false, follow: false },
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
