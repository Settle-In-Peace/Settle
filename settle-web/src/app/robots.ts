import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api', '/crm', '/dashboard', '/debts', '/leads', '/portal', '/profile', '/sales', '/settlement', '/collections', '/staff'],
    },
    sitemap: 'https://settleinpeace.com/sitemap.xml',
  };
}
