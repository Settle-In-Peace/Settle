import { PARTNER_OFFERS } from '../../../config/partner-offers';

export const dynamic = 'force-dynamic';

/**
 * Affiliate click-through redirect — /out/curadebt → 302 to the partner URL.
 * The offer id is resolved server-side from PARTNER_OFFERS so the route
 * can't be used as an open redirect to arbitrary destinations. Each click
 * is logged server-side (offer id + referer) until a real analytics sink
 * exists; keep links marked rel="sponsored nofollow" at the source.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ offer: string }> },
) {
  const { offer } = await params;
  const match = PARTNER_OFFERS.find((o) => o.id === offer);
  if (!match) {
    return new Response('Not found', { status: 404 });
  }

  const referer = request.headers.get('referer') || '';
  console.log(`[affiliate-click] offer=${match.id} referer=${referer}`);

  return Response.redirect(match.url, 302);
}
