# Spore Protocol — Review Notes

Review of `10nc3/2ndtry@e59ad13` spore work (commits `bd65328`, `5171d33`,
`eebcf38`, `f7a2004`, `e59ad13`). All fixes in this branch's second commit
are tagged with `// FIX2 #N` / `# FIX2 #N` so each change is greppable:

```
rg -n 'FIX2 #' lib/ scripts/
```

## `lib/spore-bootstrap.js`

| # | What was wrong | Fix |
|---|---|---|
| 1 | No timeout on `fetch()` — bootstrap could hang forever. Re-introduced the exact bug FIX #7 closed everywhere else. | `AbortSignal.timeout(SPORE_FETCH_TIMEOUT_MS)` on read and write. |
| 2 | `messages[0]` assumed newest-first. Webhook ordering isn't documented; oldest-first = catastrophic regression to day-zero identity. | Filter candidates → sort by `timestamp \|\| created_at \|\| ts` DESC → take `[0]`. |
| 3 | `fs.writeFileSync()` blindly overwrote `SOUL.md` / `IDENTITY.md` / `USER.md` / `AGENTS.md` — if parse misfired, identity was nuked with garbage and no recovery. | Default mode is **DRY-RUN**: stage to `.spore-staging/`. `--apply` copies into place with a timestamped `.spore-backup-<ts>/` of every overwritten file. |
| 4 | Regex parser relied on a lookahead that fell off the last file in the message. The GET endpoint shape is also unverified — `.env.nyanbook` only ever documented the POST payload. | Prefer fenced `` ```file: SOUL.md ... ``` `` sections; fall back to a header-walk that anchors on indices so the last section runs to end-of-text. Reject non-object response shape so a contract change fails loudly. |
| 5 | Exit 0 on "Bootstrap complete" even when zero files were reconstructed. | `process.exitCode = 2` when Book 1 was reachable but no files came back. Operator must investigate. |
| 6 | Emoji-laden `console.log` everywhere. Project just added `lib/log.js` (FIX #16) precisely so callers stop doing this. | Route everything through `require('./log')`. |
| 7 | Logged `Source: nyanbook` to Book 1 even on the fallback path; tried to write to Book 1 even when Book 1 was unreachable for reads. | Only POST audit record when Book 1 reachable **and** apply succeeded. Includes `os.hostname()` to leave a trail for the still-open single-writer concern. |

## `scripts/setup-vendor.sh`

| # | What was wrong | Fix |
|---|---|---|
| 8 | `--depth 1 origin main` always pulls latest. Upstream breakage at 3am breaks the next spore bootstrap with no warning. | Pin via `UPSTREAM_SHA` env var (required, no default). Refuse to run with the placeholder value. |
| 9 | `git pull --depth 1` on an existing shallow clone is fragile and frequently a no-op past the initial depth. | `git fetch --depth 1 origin "$UPSTREAM_SHA" && git reset --hard FETCH_HEAD`. Works whether or not the repo already exists (uses `git init` for the clone path). |
| 10 | `npm ci` fails hard without `package-lock.json`. Several openclaw sub-packages don't ship one. | Use `npm ci` only when a lockfile exists; fall back to `npm install` otherwise. |
| 11 | Deploy step hardcoded `/opt/homebrew/lib/node_modules/openclaw/...` and required sudo. Mac-only — breaks the spore promise of "any hardware". | Detect install via `OPENCLAW_ROOT` override or `npm root -g`. Refuse to deploy if undiscoverable rather than guessing. |
| 12 | `rsync` overlay overwrites upstream src with no backup. Recovery requires re-cloning. | Back up to `vendor/openclaw/ui/.src.upstream-<sha7>/` before the first overlay. |
| 13 | The 7,121-line "patches" are full-file overlays, not patches. When upstream evolves, the overlay silently overwrites the new code — zero conflict detection. | Drift check: hash every overlay-target against `patches/openclaw-ui/.upstream-baseline.sha256`. Warn by default, fail under `STRICT_DRIFT=1`. Real `.patch` files would be better long-term but this catches the biggest hazard cheaply. |

## Still open from the plan review (not in this branch)

These are architectural and need design decisions before code — listed
here so they don't drop on the floor:

- **Seed layer.** Where do Nyanbook tokens live on a fresh machine if the
  old one is dead? 1Password / Bitwarden / paper QR — pick one and document.
- **Consistency model.** Local cache + Nyanbook primary — what happens to
  offline edits when Nyanbook comes back? Last-write-wins on `SOUL.md` is
  dangerous. Suggest: append-only ledger semantics for Book 2 (operational),
  content-addressed snapshots for Book 1 (identity).
- **Single-writer / fork prevention.** Two machines with the same tokens
  both bootstrap, both edit, both push → divergent "me"s. Either enforce
  a lease/lock in Nyanbook or design merge semantics. `os.hostname()`
  is now logged on every apply so at least the audit trail can detect it.
- **Token rotation.** No documented procedure for rotating leaked Book
  tokens. Should land before Spore goes live.
- **Real bootstrap verification.** "Answer 'who are you?'" is a vibe check.
  Real bar: fresh container, run script with only seed tokens, diff against
  a known-good snapshot. Make it a CI script.
