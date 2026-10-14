import type { MetadataRoute } from 'next';
import { getAllArticles } from '../content/articles';
import { STATES } from '../content/states';

const BASE = 'https://settleinpeace.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { path: '', priority: 1 },
    { path: '/assessment', priority: 0.9 },
    { path: '/register', priority: 0.9 },
    { path: '/learn', priority: 0.8 },
    { path: '/debt-relief', priority: 0.8 },
    { path: '/compare', priority: 0.8 },
    { path: '/calculators', priority: 0.8 },
    { path: '/tools/eligibility-checker', priority: 0.8 },
    { path: '/providers', priority: 0.7 },
    { path: '/coaching', priority: 0.7 },
    { path: '/questions', priority: 0.7 },
    { path: '/roadmap', priority: 0.5 },
    { path: '/disclosures', priority: 0.3 },
    { path: '/privacy', priority: 0.3 },
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

  return [...staticRoutes, ...articleRoutes, ...stateRoutes];
}
