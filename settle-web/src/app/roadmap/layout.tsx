import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Product Roadmap & Feature Requests | Settle In Peace',
  description:
    'See what we are building next, vote on feature requests, and suggest improvements to Settle In Peace.',
  alternates: { canonical: '/roadmap' },
};

export default function RoadmapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
