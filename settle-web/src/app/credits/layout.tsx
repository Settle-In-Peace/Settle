import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SI Credits — Settle In Peace',
  description:
    'Prepaid SI credits power premium intelligence features across Settle. Buy a pack once, spend credits per SI call.',
  robots: { index: false, follow: false },
};

export default function CreditsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
