'use client';

import { API_URL } from '../../../lib/apiUrl';

/**
 * Public attorney-profile contact links. Clicks are instrumented via the
 * directory click endpoint with a `target` so listing-stats can separate
 * website click-throughs from phone taps. Fire-and-forget: keepalive fetch
 * so anchor navigation is never blocked.
 */
export default function AttorneyContactLinks({
  slug,
  website,
  phone,
}: {
  slug: string;
  website?: string;
  phone?: string;
}) {
  const trackClick = (target: 'website' | 'phone') => {
    try {
      void fetch(`${API_URL}/providers/attorneys/${encodeURIComponent(slug)}/click`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      }).catch(() => {});
    } catch {
      /* never break navigation */
    }
  };

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => trackClick('website')}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Visit website
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={() => trackClick('phone')}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
        >
          Call {phone}
        </a>
      )}
    </div>
  );
}
