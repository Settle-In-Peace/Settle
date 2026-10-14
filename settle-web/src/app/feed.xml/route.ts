import { getAllArticles } from '../../content/articles';

const BASE = 'https://settleinpeace.com';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET() {
  const items = getAllArticles()
    .map(
      (a) => `  <item>
    <title>${esc(a.title)}</title>
    <link>${BASE}/learn/${a.slug}</link>
    <guid>${BASE}/learn/${a.slug}</guid>
    <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
    <description>${esc(a.excerpt)}</description>
  </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Settle In Peace — Debt Relief Guides</title>
  <link>${BASE}/learn</link>
  <description>Practical guides to debt settlement, negotiation, budgeting, and credit recovery.</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
