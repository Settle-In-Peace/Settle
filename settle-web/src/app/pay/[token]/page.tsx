import type { Metadata } from 'next';
import PayPortalClient from './PayPortalClient';

/**
 * Debtor payment portal — public, token-gated. The token is a random bearer
 * credential minted staff-side (POST /collections/accounts/:id/portal-link);
 * there is deliberately no directory or listing of links. DARK by default:
 * nothing debtor-facing links here until the send decision is made.
 */
export const metadata: Metadata = {
  title: 'Payment Portal | Settle In Peace',
  description: 'Secure account payment portal.',
  robots: { index: false, follow: false },
};

export default async function PayPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PayPortalClient token={token} />;
}
