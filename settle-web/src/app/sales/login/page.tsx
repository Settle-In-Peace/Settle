'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '../../../components/LoadingSpinner';

/**
 * Redirects to the unified staff login.
 * Kept for backward compatibility with existing bookmarks/links.
 */
export default function SalesLoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/staff/login');
  }, [router]);

  return <LoadingSpinner />;
}
