import { redirect } from 'next/navigation';

// Moved: credit monitoring is a member surface, not a provider-portal page.
// /portal/credit permanently redirects to /dashboard/credit.
export default function PortalCreditRedirect() {
  redirect('/dashboard/credit');
}
