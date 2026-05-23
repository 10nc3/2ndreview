# 2ndtry — from 17 MB verbatim OpenClaw to opinionated harness

A hardened, opinionated fork of the OpenClaw distribution data directory.
Carved down from 3,083 files / 17.7 MB to a minimal, LLM-ingestable shell
that runs verbatim on a Mac Mini (or any host) without `openclaw update`
or `openclaw doctor` ever touching it.

## Why

Vanilla OpenClaw ships its data dir with everything inside it:
vendored `node_modules`, generated shell completions, accidental session
logs, SQLite WAL/SHM journals, runtime caches, leaked device keypairs,
and a 119 KB plugin registry. That's de jure bloat (what upstream ships)
and de facto bloat (what accumulates from running it). Together it makes
the workspace impossible for an LLM to ingest — Kimi rejected it at
277,943 tokens against a 262,144 limit.

This fork keeps only what defines the harness. Everything regeneratable
is `.gitignore`'d. Everything sensitive is excluded.

## What's in the repo

```
.gitignore                  aggressive — see below
README.md                   this file
npm/package.json            dependency manifest (Discord + Brave plugins)
npm/package-lock.json       pinned versions
workspace/                  soul files (mostly blank, ours to fill)
  AGENTS.md                 agent behavior rules
  SOUL.md                   personality / tone
  IDENTITY.md               who the agent is
  USER.md                   who the human is
  TOOLS.md                  available tools
  BOOTSTRAP.md              first-run setup (deleted after)
  HEARTBEAT.md              periodic checks (empty by default)
```

That's it. Everything else generates on first run.

## What's excluded and why

| Excluded                          | Reason                                |
|-----------------------------------|---------------------------------------|
| `npm/node_modules/`               | `npm install` regenerates from lockfile |
| `completions/openclaw.*`          | OpenClaw regenerates on demand        |
| `agents/*/sessions/`              | Runtime LLM session logs              |
| `*.sqlite*`                       | Runtime DB state (tasks, flows)       |
| `tui/last-session.json`           | Runtime UI state                      |
| `plugins/installs.json`           | Auto-generated with machine-local paths |
| `identity/device*.json`           | Per-machine keypair — never commit    |
| `devices/paired.json`             | Per-machine pairing state             |
| `gateway-supervisor-restart-handoff.json` | Transient supervisor handoff  |
| `update-check.json`               | Update cache                          |

## How the Mac Mini runs this

```bash
# one time
git clone https://github.com/10nc3/2ndtry.git ~/.openclaw
cd ~/.openclaw/npm && npm install

# every time
openclaw   # reads from ~/.openclaw, generates runtime state on first launch
```

OpenClaw core itself (the binary) is installed separately via Homebrew or
npm-global. This repo is only the data directory it reads from.

## Hard rules

- **Never run `openclaw update` against this fork.** Upstream will try to
  re-add the bloat. If a real upgrade is needed, port changes in
  manually.
- **Never commit `identity/`, `devices/`, `service-env/`, or any
  `.env*`.** Those are machine-local secrets. The previous version of
  this repo leaked a device private key — assume it was burned and
  rotate.
- **Soul files (`workspace/*.md`) are ours to define**, not OpenClaw's
  templates. Keep them blank until we have something real to put there.

## Roadmap

- [x] Step 1 — De-bloat the repo (17.7 MB → 68 KB)
- [x] Step 1.5 — Aggressive `.gitignore`, README
- [ ] Step 2 — Blank soul files, write identity/user/soul from scratch
- [ ] Step 3 — Plugin/tool triage: cut everything not needed for the
  Discord concierge co-worker
- [ ] Step 4 — Wire Discord token + LLM provider
- [ ] Step 5 — Mac Mini posts in Discord, concierge replies

## Status

Step 1 complete. Repo is now ingestable by any LLM, runnable verbatim by
the Mac Mini, and free of leaked secrets.
