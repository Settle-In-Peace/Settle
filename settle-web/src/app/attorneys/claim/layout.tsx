import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Claim Your Attorney Listing | Settle In Peace',
  description: 'Claim your bankruptcy attorney listing on Settle In Peace to manage your profile.',
  alternates: { canonical: '/attorneys/claim' },
};

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
