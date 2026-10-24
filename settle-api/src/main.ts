import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, raw, urlencoded } from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Disable default body parser so we can configure custom raw-body support
    bodyParser: false,
  });

  // Helmet middleware for security headers
  app.use(helmet());

  // Webhook routes that need the raw body for signature verification.
  // req.path excludes the query string, so these matches are robust.
  const isRawBodyWebhookRoute = (path: string) =>
    path === '/stripe/webhook' ||
    path === '/api/v1/stripe/webhook' ||
    path.startsWith('/telnyx/webhooks') ||
    path.startsWith('/lead-vendors/import/webhook') ||
    path.startsWith('/payment-processors/webhooks') ||
    path.startsWith('/affiliates/postback');

  // Raw body parser for webhook routes (signature verification requires the raw body)
  app.use((req, res, next) => {
    if (isRawBodyWebhookRoute(req.path)) {
      raw({ type: '*/*', limit: '2mb' })(req, res, next);
    } else {
      next();
    }
  });
  // Routes that legitimately carry large JSON payloads — /esign/sign ships
  // a fully rendered signed PDF as base64 (up to ~11MB for an 8MB artifact).
  const isLargeBodyRoute = (path: string) => path.startsWith('/esign');

  // JSON body parser for all other routes (1MB limit, 15MB for large-body routes)
  app.use((req, res, next) => {
    if (isRawBodyWebhookRoute(req.path)) {
      // Preserve rawBody for signature verification
      req.rawBody = req.body;
      next();
    } else {
      json({ limit: isLargeBodyRoute(req.path) ? '15mb' : '1mb' })(req, res, next);
    }
  });
  // URL-encoded body parser (1MB limit) for non-webhook routes
  app.use((req, res, next) => {
    if (isRawBodyWebhookRoute(req.path)) {
      next();
    } else {
      urlencoded({ limit: '1mb', extended: true })(req, res, next);
    }
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Enable CORS from env variable (comma-separated), with dev fallback
  // In development, allow all origins so browser preview / arbitrary ports work.
  app.enableCors({
    origin: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
      ? true
      : process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) || ['http://localhost:3025'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 4025);
}
bootstrap();
