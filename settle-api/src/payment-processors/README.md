# payment-processors — high-risk card acceptance layer

Debt collection runs under a high-risk MCC; Stripe will not board it. This
module adds processor adapters **alongside** `src/stripe/` (which stays for
mainstream subscriptions / lead purchases).

## Processors

| Processor | Env gate | Tokenization | Notes |
|---|---|---|---|
| `nmi` | `NMI_SECURITY_KEY` | Collect.js (`NMI_PUBLIC_KEY`) | Primary. Sandbox: `sandbox.nmi.com`, prod: `secure.nmi.com`. Vault + `add_subscription` recurring. Webhooks: `Webhook-Signature: t=<nonce>,s=<hmac>` verified with `NMI_WEBHOOK_SECRET`; Query API (`query.php`) poller as fallback. |
| `authorizenet` | `AUTHNET_API_LOGIN_ID` + `AUTHNET_TRANSACTION_KEY` | Accept.js (`AUTHNET_CLIENT_KEY`) | **UNTESTED** — verify against a sandbox.authorize.net account. Webhooks: `X-ANET-SIGNATURE: sha512=…` with `AUTHNET_SIGNATURE_KEY`. |
| `stripe` | `STRIPE_SECRET_KEY` | Stripe.js PaymentMethod | Last-resort fallback (most collection agencies are not boardable). No recurring plans. |

## PCI posture

The API **never accepts PAN/CVV**. `POST /payment-processors/charge` takes a
single-use processor token (Collect.js `payment_token`, Accept.js
`opaqueData.dataValue`, Stripe `pm_…`) or a stored `vaultId`. The DTO has no
card fields, and `assertNoSensitiveCardData()` rejects any payload carrying
card-shaped keys — enforced before routing. We persist `card_brand` +
`card_last4` only, and gateway responses are sanitized before storage.

## Router policy (`PAYMENT_PROCESSOR_PRIORITY=nmi,authorizenet,stripe`)

- Providers are attempted in priority order.
- Failover happens **only** on `ProcessorUpstreamError` (network / timeout /
  HTTP 5xx). A declined card is a *result*, never retried — resubmitting the
  same card to another MID would decline again or double-charge.
- Tokens are processor-specific: a Collect.js token cannot be charged through
  AuthNet. Failover is meaningful for vault/card-on-file charges and upstream
  outages; for first-time browser charges the client should re-tokenize.

## FDCPA / state compliance

Each charge stores `permitted`, `disclosure_text`, and
`disclosure_acknowledged_at`. The API refuses a charge without
`disclosureAcknowledged: true` — convenience-fee legality differs by state,
so the UI must show the applicable disclosure text (sent verbatim in
`disclosureText` for the audit trail).

## Endpoints

| Route | Guard | Purpose |
|---|---|---|
| `GET /payment-processors/status` | JWT + sales/admin | per-processor configured/env/hosted-fields descriptor |
| `POST /payment-processors/charge` | JWT + sales/admin | charge a token/vault id |
| `POST /payment-processors/refund` | JWT + sales/admin | `{ paymentId, amountCents?, reason? }` |
| `POST /payment-processors/void` | JWT + sales/admin | `{ paymentId }` |
| `GET /payment-processors/accounts/:accountId/payments` | JWT + sales/admin | history |
| `GET /payment-processors/debts/:debtId/payments` | JWT + sales/admin | history |
| `POST /payment-processors/webhooks/:processor` | public, signature-verified | webhook ingest (fails closed without secret) |

## Registration (orchestrator — not applied by this commit to avoid collisions)

`app.module.ts`:
```ts
import { PaymentProcessorsModule } from './payment-processors/payment-processors.module';
import { ProcessorPayment } from './entities/processor-payment.entity';
// entities: [..., ProcessorPayment]  in both TypeOrmModule.forRoot and forFeature lists
// imports: [ ..., PaymentProcessorsModule ]
```

`data-source.ts`: add `ProcessorPayment` to the `entities` array.

`migrations/run-migration.ts`:
```ts
import { CreateProcessorPaymentsTable1700000000034 } from './1700000000034-CreateProcessorPaymentsTable';
// ...append to the `migrations` array (after 1700000000033-*)
```

`main.ts` — webhook route needs the raw body for HMAC verification:
```ts
path.startsWith('/payment-processors/webhooks')
```
added to `isRawBodyWebhookRoute`. Without it NMI signature verification will
reject deliveries (re-serialized JSON breaks the HMAC) — fail-closed by design.

## NMI webhook setup

Merchant portal → Settings → Webhooks → Create: URL
`https://<api-host>/payment-processors/webhooks/nmi`, copy the signing key
into `NMI_WEBHOOK_SECRET`. `t` in the signature is a nonce (no replay window).
If webhooks aren't enabled for the account, poll `NmiProvider.queryTransaction()`
(Query API) to reconcile status.
