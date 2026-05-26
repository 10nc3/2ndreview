# Hermes Migration Hardening Review (FIX4)

Reviewer: replit-agent (this session)
Target: `10nc3/3rdtry` @ `cea87d91` (Python hermes-agent fork, post-openclaw migration)
Scope: spore-equivalent surface only — SOUL bootstrap, identity resolution, setup
script, first-run seeding. Did **not** audit cli.py, run_agent.py, gateway/, providers/,
plugins/, or the docusaurus tree — those are upstream-hermes territory and out of scope
for a "what changed in your migration that's worth knowing" review.

## Topline

Hermes is significantly better hardened than the openclaw stack was. Most of the patterns
that needed FIX/FIX2/FIX3 commits against `spore-bootstrap.js` are already present here:

| Old openclaw FIX | Hermes equivalent | Status |
|---|---|---|
| FIX2 #10 npm-ci fallback | `setup-hermes.sh` multi-tier extras with `_BROKEN_EXTRAS` quarantine | Done, and done better |
| FIX2 #13 transitive hash verification | `uv sync --extra all --locked` against `uv.lock` | Done correctly |
| FIX3 #2 prompt-injection scan | "scans it for prompt-injection patterns" (per `use-soul-with-hermes.md` §How Hermes uses it) | Documented; not audited |
| FIX3 #3 starter templates | `hermes_cli/default_soul.py` seeded on first run | Done |
| FIX3 #4 staleness / drift | "loaded fresh each message — no restart needed" (per `docker/SOUL.md`) | Done by design |
| FIX2 #3 no-overwrite-on-seed | "if you already have a SOUL.md, Hermes does not overwrite it" | Done |
| FIX2 #1 explicit fetch failure | `setup-hermes.sh` captures uv installer output via tempfile, prints on fail | Done |

So this review is **defensive hardening, not bug fixes**. Severity is mostly Low.

---

## Findings

### H1 — `setup-hermes.sh` runs unverified `uv` installer over the network
**Severity:** Medium (supply-chain)
**Location:** `setup-hermes.sh:92,99`
**What:** On any machine without `uv` pre-installed, the script does:
```bash
curl -LsSf https://astral.sh/uv/install.sh -o "$_uv_installer"
sh "$_uv_installer" ...
```
No checksum, no signature, no pinned version. If `astral.sh` is ever compromised or DNS-
poisoned for a user, every fresh hermes install on a new machine pulls and executes
attacker-controlled shell. This is the single largest residual exposure in the spore
surface.
**Recommendation:** pin a known-good SHA256 of `install.sh` (or a specific uv release URL),
verify with `sha256sum -c` before `sh`, and provide a `HERMES_UV_INSTALL_SHA256` env var
escape hatch for users who want to roll forward. See `patches/01-uv-installer-sha256.diff`.

### H2 — `setup-hermes.sh` uses `set -e` only
**Severity:** Low
**Location:** `setup-hermes.sh:20`
**What:** Missing `set -u` and `set -o pipefail`. The script already uses `${VAR:-}`
defensively in most places, but inconsistently — a typo in any of the half-dozen bare
`$VAR` references silently expands to empty. Without pipefail, any future `cmd | tail`
masks non-zero exits from `cmd`. The script already does the right thing in spirit
(careful tempfile handling, capture-and-print on failure); the missing options are
cheap insurance.
**Recommendation:** `set -euo pipefail`. See `patches/02-strict-bash.diff`.

### H3 — `docker/SOUL.md` ships as an HTML-comment-only stub
**Severity:** Medium (UX/persona)
**Location:** `docker/SOUL.md` (15 lines, all inside `<!-- … -->`)
**What:** Per `use-soul-with-hermes.md` §First-run behavior: *"if the file exists but is
empty, Hermes adds nothing from it to the prompt"*. Docker users get a SOUL.md that, once
the HTML comments are stripped, **is** effectively empty — meaning the persona slot in
the system prompt is silently blank for every Dockerized run unless the user proactively
edits the file. POSIX users (whose first-run seeding writes `default_soul.py`'s real
content) get a sensible default. Docker users get nothing.
**Recommendation:** either (a) write `DEFAULT_SOUL_MD` from `hermes_cli/default_soul.py`
into `docker/SOUL.md` so the two paths agree, or (b) have the SOUL loader treat
"comments-and-whitespace only" as "missing, fall back to default" instead of "empty,
contribute nothing". (a) is the smaller change; (b) is the more robust fix.

### H4 — `whatsapp_identity.py` BFS has no bound
**Severity:** Low (DoS via crafted bridge state)
**Location:** `whatsapp_identity.py:86-119`
**What:** `expand_whatsapp_aliases` walks `lid-mapping-*.json` files via BFS with a
visited set, so it terminates — but on a fresh bridge-state directory under attacker
control (the bridge writes JSON the gateway then reads), a crafted long chain could force
hundreds of filesystem reads per identity resolution. The bridge is normally trusted,
so this is theoretical, but a `MAX_ALIASES = 64` guard is one line and removes the
"trust the bridge filesystem" assumption.
**Recommendation:** add a numeric cap on `resolved` size; log + break when hit.

### H5 — `whatsapp_identity.py` canonical tiebreaker is undocumented
**Severity:** Trivial (clarity)
**Location:** `whatsapp_identity.py:155`
**What:** `min(aliases, key=lambda c: (len(c), c))` picks shortest-then-lexical. The
docstring says "shortest (numeric-preferred)" but neither alpha-vs-numeric nor lexical
ordering is actually applied — it's pure string `min`. Works correctly for the
numeric-vs-numeric case that actually occurs in practice, but the docstring should
match the implementation or vice versa. Recommend: leave the code, fix the docstring
to say "shortest, then lexicographically smallest".

### H6 — `hermes_bootstrap.py` is correctly scoped to Windows-only
**Severity:** None (positive note)
**Location:** `hermes_bootstrap.py`
**What:** This module is *not* the spore bootstrap I expected from the filename — it's
a Windows UTF-8 stdio fix. The code is good: POSIX no-op, idempotent flag, uses
`setdefault` so users can opt out via `PYTHONUTF8=0`, swallows `OSError`/`ValueError`
on already-closed streams. No changes recommended. Flagging here only because the name
collides with what `spore-bootstrap.js` did in the openclaw stack — anyone porting
mental models from the old harness will look for SOUL-loading logic here and find none.
Consider renaming to `hermes_windows_utf8.py` or adding a one-line module docstring
clarifying "this is not the agent bootstrap; for SOUL loading see ...".

### H7 — `default_soul.py` baked into Python source
**Severity:** Low (discoverability)
**Location:** `hermes_cli/default_soul.py`
**What:** The fallback persona is a Python string constant, not a packaged markdown file.
Users who want to see "what does Hermes default to if I delete SOUL.md?" have to grep
Python source. Minor; mainly a docs/discoverability issue. If you ever ship
`default_soul.md` alongside, also expose its path via `hermes status` or `hermes doctor`.

---

## Items deliberately NOT flagged

- `setup-hermes.sh` writing to `~/.bashrc` / `~/.zshrc` without `# BEGIN HERMES` markers —
  the grep guard makes it idempotent in practice; marker blocks would be polite but not
  a security issue.
- `setup-hermes.sh` removing `venv/` unconditionally on rerun — destructive but intentional
  and clearly logged.
- `.env.example` (23KB) — not audited; flagging only that I didn't audit it, so the
  default-secrets-template surface is open work if you want it.
- The full upstream hermes codebase (cli.py, run_agent.py, gateway, providers, plugins) —
  out of scope. If you want a deeper pass on any specific subsystem, name it and I'll
  scope a follow-up.

## Carried-forward open items from FIX3 (still applicable)

- Token rotation story for hermes API keys (`.env`) — same gap as old openclaw config.
- Single-writer enforcement for `~/.hermes/SOUL.md` if multiple hermes processes can run
  concurrently on one HERMES_HOME (cron + interactive + gateway). Per the docs SOUL.md
  is read-only at runtime, so likely a non-issue, but worth a sentence in the docs.
- CI bootstrap verification: a smoke test that `setup-hermes.sh` on a clean container
  produces a working `hermes status` would catch H1/H2-class regressions early.

## Marker convention

If you want any of these patches landed upstream, please tag the resulting commits
`// FIX4 #N` (matching this file's H1..H7) so they grep cleanly alongside the prior
FIX/FIX2/FIX3 markers in 2ndreview history.
