# Spore Protocol — Review Notes (FIX3 round)

Closes the four architectural items left open in `SPORE-REVIEW-NOTES.md`
after the FIX2 round. All changes tagged `// FIX3 #N` / `# FIX3 #N`:

```
rg -n 'FIX3 #' lib/
```

## `lib/spore-bootstrap.js`

| # | Open item from FIX2 notes | What this round does |
|---|---|---|
| 1 | "Local cache isn't actually a cache — nothing syncs Book 1 → local." | On every successful `--apply` from Nyanbook, snapshot the just-written identity files into `.spore-cache/<iso-ts>/`. Keeps last `SPORE_MAX_CACHE` (default 10) snapshots and prunes the rest. The cache layer is now real. |
| 2 | "Primacy isn't verified, just probed — reachable Book 1 ≠ authoritative." | `assessBook1Quality(messages)` requires (a) ≥1 checkpoint-shaped message in the last 25 and (b) ≥1 of them parses to non-zero identity files. If quality fails, source downgrades to `cache` (or below) and the operator sees the reason. `--force-nyanbook` is an escape hatch for testing. |
| 3 | "Template defaults — third tier in the doc — was never implemented." | New `lib/spore-templates/` directory with vanilla `SOUL.md`, `IDENTITY.md`, `USER.md`, `AGENTS.md`. When tiers 1-3 all fail, `--apply` writes templates into the workspace and exits **3** so callers know the agent is operating without continuity. |
| 4 | "No staleness signal on the fallback path." | Every boot resolves a source tier (`nyanbook`/`cache`/`workspace`/`vanilla`) and computes an age string. Cache snapshots use the ISO directory name. Workspace tier falls back to newest `mtime` among identity files. Vanilla is reported as "no prior identity". Tier + age are logged on every run and included in the Book 1 audit record. |

## Exit codes (now formal)

| code | meaning |
|------|---------|
| 0 | success — `nyanbook` or warm `cache` |
| 1 | fatal error |
| 2 | Book 1 reachable but produced no usable checkpoint (FIX2 #5, preserved) |
| 3 | vanilla bootstrap — templates written, no prior identity |

## Behaviour matrix

| Book 1 reachable? | Book 1 quality? | Cache present? | Workspace files? | Source | Exit |
|---|---|---|---|---|---|
| yes | OK              | any | any | `nyanbook`  | 0 |
| yes | FAIL            | yes | any | `cache`     | 2 |
| yes | FAIL            | no  | yes | `workspace` | 2 |
| yes | FAIL            | no  | no  | `vanilla`   | 3 |
| no  | n/a             | yes | any | `cache`     | 0 |
| no  | n/a             | no  | yes | `workspace` | 0 |
| no  | n/a             | no  | no  | `vanilla`   | 3 |

## Still open (genuinely architectural, need design calls)

- **Seed layer for first-ever bootstrap.** Where do `BOOK_1_TOKEN` / `BOOK_2_TOKEN` live on a fresh machine when the old one is dead and the operator only has paper? Pick one: 1Password CLI, Bitwarden CLI, paper QR + camera. Document in `AGENTS.md`.
- **Single-writer / fork prevention.** Two containers with the same tokens both bootstrap, both run, both write. `os.hostname()` is now stamped on every audit record so divergence is *detectable*, but nothing *prevents* it. Either a Book 1 lease/lock or explicit merge semantics for divergent identities.
- **Token rotation.** No documented procedure for rotating leaked tokens. Should land before Spore goes anywhere near production.
- **Consistency for offline Book 2 edits.** Append-only ledger for operational state vs. content-addressed snapshots for identity — needs an explicit policy, not just a comment.
- **Real CI verification.** "Fresh container, only seed tokens, bootstrap, diff against known-good snapshot." Make it a GitHub Action so we catch regressions before they hit a real spore.
