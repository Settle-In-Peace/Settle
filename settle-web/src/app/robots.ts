import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api',
        '/collections',
        '/crm',
        '/dashboard',
        '/debts',
        '/forgot-password',
        '/leads',
        '/login',
        '/portal',
        '/profile',
        '/reset-password',
        '/sales',
        '/settlement',
        '/staff',
      ],
    },
    sitemap: 'https://settleinpeace.com/sitemap.xml',
  };
}
