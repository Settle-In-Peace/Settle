'use client';
import { usePathname } from 'next/navigation';
import Footer from './Footer';
import FeedbackWidget from './FeedbackWidget';

// Internal workspaces (sales/admin/crm) have their own chrome — the public
// marketing footer and feedback widget don't belong there.
export default function ConditionalFooter() {
  const pathname = usePathname();
  if (['/sales', '/admin', '/crm'].some((p) => pathname.startsWith(p))) {
    return null;
  }
  return (
    <>
      <Footer />
      <FeedbackWidget />
    </>
  );
}
