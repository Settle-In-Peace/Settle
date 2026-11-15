# Provider Invite — partner-recruitment email batches

Generates a 3-touch outreach sequence for prospective debt-relief providers
from a CSV of prospects. Writes ready-to-send `{to, subject, body}` rows to
`out/`, and a companion sender `send_provider_invites.mjs` delivers them via
Resend (dry-run by default; `--send` refuses without `--unsubscribe-url` +
`--mailing-address` — CAN-SPAM; suppression list `out/suppression.txt`).

This is the supply side of the P0 provider-inventory gap: the marketplace has
leads but needs enrolled providers to monetize. Recipients land on
`https://settleinpeace.com/providers` → `POST /providers/enroll` → admin
approval → emailed password-setup link → portal access → matched leads.

## Usage

```bash
cd tools/provider-invite

# generate all 3 touches for every prospect -> out/provider-invites-all.jsonl
node generate_invite_emails.mjs --csv prospects.csv

# a single touch, CSV format, explicit output file
node generate_invite_emails.mjs --csv prospects.csv --touch 1 --format csv -o out/touch1.csv

# preview without writing (counts + 2 rendered samples)
node generate_invite_emails.mjs --csv prospects.csv --dry-run
```

## CSV format

Headers are matched case-insensitively; extra columns are ignored.

| column    | required | used for                                   |
|-----------|----------|--------------------------------------------|
| `company` | yes      | company name (`name`/`company_name` alias) |
| `email`   | yes      | recipient (rows without it are skipped)    |
| `contact` | no       | greeting name (`contact_name`/`first_name`)|
| `state`   | no       | "in <state>" personalization + `--state`   |
| `website` | no       | reference only                             |

## Options

- `--csv <path>` — input CSV (required)
- `--touch <1|2|3|all>` — which touches (default `all`)
- `--format <jsonl|csv>` — output format (default `jsonl`)
- `-o, --out <path>` — output file (default `out/provider-invites-<touch>.<ext>`)
- `--base-url <url>` — site base for enroll links (default `https://settleinpeace.com`)
- `--sender-name <str>` — signature (default `Settle In Peace Partnerships`)
- `--state <XX>` — only prospects in a state (batch by market)
- `--limit <n>` — max rows
- `--dry-run` — counts + samples, writes nothing

## Compliance notes

- Signed as **Settle In Peace Partnerships** — never a personal name.
- Every body carries an `{{unsubscribe_url}}` placeholder; the sender MUST
  substitute a real opt-out link before delivery (CAN-SPAM).
- Keep copy claims accurate: leads are scored and consent-bearing (TCPA),
  exclusive after purchase. Don't promise volume or conversion rates.
- B2B outreach only — licensed debt-settlement/consolidation providers, not
  consumers.

## Sourcing prospects

Owner supplies the real prospect CSV (licensed debt-settlement companies by
state — AFCC member directory, state licensing registries, DBA lists). Drop it
next to this script as `prospects.csv` and run the commands above. `out/` is
gitignored.

## Sending (send_provider_invites.mjs)

```bash
export RESEND_API_KEY=$(grep '^RESEND_API_KEY=' ../../settle-api/.env | cut -d= -f2-)

# preview — always safe
node send_provider_invites.mjs --in out/provider-invites-1.jsonl --dry-run

# real send (requires real opt-out + postal address)
node send_provider_invites.mjs --in out/provider-invites-1.jsonl --send \
  --unsubscribe-url "mailto:support@settleinpeace.com?subject=unsubscribe" \
  --mailing-address "Reid Technology, <street>, <city>, <state> <zip>" \
  --limit 25
```

- Idempotent: `(to+touch)` rows already logged `sent` in `<in>.sent.jsonl` are skipped.
- Suppression: `out/suppression.txt` (one email/line) is enforced on every run;
  `node send_provider_invites.mjs --suppress <email>` adds an opt-out.
- Keep batches ≤25/day while the sending domain warms up.
