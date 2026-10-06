import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ask Anonymously — Probate & Estate Questions | Settle In Peace',
  description:
    'Ask probate, debt, tax, and estate questions anonymously. Community answers and verified responses from the Settle team. Your question is public; your identity is not.',
  alternates: { canonical: '/questions' },
};

export default function QuestionsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
