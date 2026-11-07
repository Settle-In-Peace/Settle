import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Debt Relief Q&A | Settle In Peace',
  description: 'Community answers to real debt relief questions — settlement, collections, credit repair, and more.',
};

export default function QuestionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
