import type { NextConfig } from "next";
import path from "path";

// Static export for Cloudflare Pages (legacy, kept for reference).
// OpenNext for Cloudflare Workers is the primary deploy target and uses
// the normal standalone build — no output: "export" needed.
const isStaticExport =
  process.env.CF_PAGES === "1" || process.env.OUTPUT_EXPORT === "1";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  // OpenNext for Cloudflare Workers uses the default standalone build.
  // Only switch to static export if explicitly requested (legacy Pages path).
  ...(isStaticExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {
        async redirects() {
          return [
            {
              source: '/portal/leads',
              destination: '/portal',
              permanent: true,
            },
          ];
        },
        async headers() {
          // Hosted card fields: Stripe js.stripe.com, NMI Collect.js
          // (secure/sandbox.nmi.com), Authorize.Net Accept.js — plus their
          // iframes. Firebase phone auth needs google/gstatic reCAPTCHA.
          const csp = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://secure.nmi.com https://sandbox.nmi.com https://js.authorize.net https://jstest.authorize.net https://apis.google.com https://www.google.com https://www.gstatic.com https://static.cloudflareinsights.com https://challenges.cloudflare.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "connect-src 'self' https: wss:",
            "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://secure.nmi.com https://sandbox.nmi.com https://js.authorize.net https://jstest.authorize.net https://www.google.com https://recaptcha.google.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; ');
          return [{
            source: '/(.*)',
            headers: [
              { key: 'Content-Security-Policy', value: csp },
              { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
              { key: 'X-Content-Type-Options', value: 'nosniff' },
              { key: 'X-Frame-Options', value: 'DENY' },
              { key: 'X-XSS-Protection', value: '1; mode=block' },
              { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
              { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
            ],
          }];
        },
      }),
};

export default nextConfig;
