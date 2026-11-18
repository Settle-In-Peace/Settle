import type { MetadataRoute } from 'next';
import { getAllArticles } from '../content/articles';
import { STATES } from '../content/states';
import { getAllCitySlugs } from '../content/cities';
import { API_URL } from '../lib/apiUrl';

const BASE = 'https://settleinpeace.com';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { path: '', priority: 1 },
    { path: '/assessment', priority: 0.9 },
    { path: '/register', priority: 0.9 },
    { path: '/learn', priority: 0.8 },
    { path: '/debt-relief', priority: 0.8 },
    { path: '/compare', priority: 0.8 },
    { path: '/calculators', priority: 0.8 },
    { path: '/debt-snapshot', priority: 0.8 },
    { path: '/tools/eligibility-checker', priority: 0.8 },
    { path: '/providers', priority: 0.7 },
    { path: '/marketplace', priority: 0.7 },
    { path: '/attorneys', priority: 0.7 },
    { path: '/coaching', priority: 0.7 },
    { path: '/questions', priority: 0.7 },
    { path: '/roadmap', priority: 0.5 },
    { path: '/disclosures', priority: 0.3 },
    { path: '/privacy', priority: 0.3 },
    { path: '/privacy-app', priority: 0.3 },
    { path: '/refund', priority: 0.3 },
    { path: '/terms', priority: 0.3 },
  ].map((r) => ({
    url: `${BASE}${r.path}`,
    changeFrequency: 'weekly' as const,
    priority: r.priority,
  }));

  const articleRoutes: MetadataRoute.Sitemap = getAllArticles().map((a) => ({
    url: `${BASE}/learn/${a.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const stateRoutes: MetadataRoute.Sitemap = STATES.map((s) => ({
    url: `${BASE}/debt-relief/${s.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const cityRoutes: MetadataRoute.Sitemap = getAllCitySlugs().map(({ state, city }) => ({
    url: `${BASE}/debt-relief/${state}/${city}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  let attorneyRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/providers/directory`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: { slug?: string; updatedAt?: string }[] };
      attorneyRoutes = (data.items ?? [])
        .filter((a) => a.slug)
        .map((a) => ({
          url: `${BASE}/attorneys/${a.slug}`,
          lastModified: a.updatedAt ? new Date(a.updatedAt) : undefined,
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        }));
    }
  } catch {
    // Directory fetch must never break the sitemap.
  }

  return [...staticRoutes, ...articleRoutes, ...stateRoutes, ...cityRoutes, ...attorneyRoutes];
}
