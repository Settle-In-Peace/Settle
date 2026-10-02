# LeadVendorsModule — registration snippet (for the orchestrating agent)

`app.module.ts`, `data-source.ts`, and `main.ts` are owned by the orchestrator.
Apply these three small edits to wire the module in:

## 1. `src/app.module.ts`

```ts
import { LeadVendorAccount } from './entities/lead-vendor-account.entity';
import { LeadImportBatch } from './entities/lead-import-batch.entity';
import { LeadPurchase } from './entities/lead-purchase.entity';
import { LeadVendorsModule } from './lead-vendors/lead-vendors.module';
```

- Append `LeadVendorAccount, LeadImportBatch, LeadPurchase` to the `entities:`
  array inside `TypeOrmModule.forRoot({ ... })` (autoLoadEntities also picks
  them up via the module's `forFeature`, but keep the explicit list in sync).
- Append the same three entities to the top-level
  `TypeOrmModule.forFeature([...])` list (optional — only needed if
  AppModule-level code injects them).
- Add `LeadVendorsModule` to the `imports:` array.

## 2. `src/data-source.ts`

```ts
import { LeadVendorAccount } from './entities/lead-vendor-account.entity';
import { LeadImportBatch } from './entities/lead-import-batch.entity';
import { LeadPurchase } from './entities/lead-purchase.entity';
```

- Append the three entities to the `entities:` array.

## 3. `src/main.ts` — exact-byte HMAC for the webhook

```ts
const isRawBodyWebhookRoute = (path: string) =>
  path === '/stripe/webhook' ||
  path === '/api/v1/stripe/webhook' ||
  path.startsWith('/telnyx/webhooks') ||
  path.startsWith('/lead-vendors/import/webhook');
```

(Without this the webhook still works — signature verification falls back to
a re-serialized body — but exact-byte verification is stronger and matches
the stripe/telnyx convention.)

## Migration

`1700000000033-CreateLeadVendorTables` is already registered in
`src/migrations/run-migration.ts` — `pnpm migration:run` picks it up.

## Env vars

See `.env.example` — `LEADVENDOR_NAMES`, `LEADVENDOR_<NAME>_*`,
`LEADVENDORS_CONFIG`, `LEAD_SCORING_LICENSED_STATES`.
