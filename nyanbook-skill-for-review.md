# nyanbook-skill — Replit Review Package

## Architecture

```
lib/nyanbook/
├── config.js        # Endpoint definitions (no secrets inline)
├── playground.js    # AI inference client — requires Bearer token
└── ledger.js        # Append-only storage — two books, separate tokens

lib/nyan-sync.js    # DUAL sync: local memory/NYAN_SYNC_LOG.md + remote book_2
lib/nyan-router.js  # Thin re-export wrapper (legacy compat)
```

## Endpoints

| Service | URL | Auth | Purpose |
|---------|-----|------|---------|
| **Playground** | `https://nyanbook.replit.app/api/v1/nyan/*` | `Bearer <token>` | AI inference (general, psi-ema, seed-metric, legal, code-audit, forex) |
| **Book 1** | `https://nyanbook.io/api/webhook/dev_book_t1_5e832e817246` | `Bearer <token>` | User journal — **manual use only** |
| **Book 2** | `https://nyanbook.io/api/webhook/dev_book_t1_d19b12da5c19` | `Bearer <token>` | Agent workspace sync target |

## Security Model

```javascript
// Secrets loaded from env (preferred) or .nyanbook-secrets.json (gitignored)
const { nyanPsiEma } = require('./lib/nyanbook/playground');  // gated: throws if token missing
const { ledgerAppend } = require('./lib/nyanbook/ledger');      // default: book_2

// Explicit opt-in required for book_1
await ledgerAppend({ ... }, 'book_1'); // user journal — never auto-synced
```

## Sync Strategy

- **Local**: Always append to `memory/NYAN_SYNC_LOG.md`
- **Remote**: POST to Book 2 webhook every 30 min via cron
- **Silent**: `delivery: { mode: "none" }` — only announces on failure
- **No pollution**: Book 1 (journal) is never touched by automation

## Cron Config

```json
{
  "id": "f9870d19-92b0-4d84-98cc-1bfc9674e740",
  "schedule": "*/30 * * * *",
  "target": "isolated",
  "delivery": { "mode": "none" }
}
```

## Token Management

Runtime: `NYAN_PLAYGROUND_TOKEN`, `NYAN_BOOK1_TOKEN`, `NYAN_BOOK2_TOKEN`
Fallback: `.nyanbook-secrets.json` (workspace local, committed as `***REDACTED***`)

All tokens redacted from source; never logged to ledger or sync output.

---
nyan~ 🔥
