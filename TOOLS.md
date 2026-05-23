# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Active Tools (Enabled in OpenClaw)

### Search Cascade
- **Perplexity** — Deep research (needs `PPLX_API_KEY`)
- **Brave** — `BSAFGRqYUSz68MvC6DzYSjaCXIq-LZr` (configured)
- **DDG** — Free fallback, lossy

### Math Cascade
- **Wolfram Alpha** — Authoritative verification (needs `WOLFRAM_APP_ID`)
- **Local math** — `lib/math/` (seed-metric, psi-ema) — deterministic, zero cost
- **LLM heuristic** — Tagged `unverified`, last resort

### Model Cascade
- **Kimi K2.6** (OpenRouter) — Primary, high quality
- **OpenRouter/auto** — Automatic fallback
- **Gemma4 E4B** (Ollama @ localhost) — Local, free, always available

### PDF Cascade
- **pdftotext** (poppler) — Best formatting, `brew install poppler`
- **nano-pdf** skill — JS-based, always available
- **Heuristic** — Raw text extraction, last resort

### GitHub
- **gh CLI** — `ghp_XLIU…EpnZ` (authenticated)
- **Pat scopes**: repo, gist, workflow, etc (read:org missing — non-blocking for repos)

### Summarize
- **summarize.sh** — URL/article/video summarization (installing via brew)

### NyanBook
- **Playground** — `NYAN_PLAYGROUND_TOKEN` = outbound API token
- **Ledger** — Book 1 (Avijja DC), Book 2 (agent sync)
- **BYOK Watchtower** — Available, needs separate Groq key

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | Gateway config, model selection, skill toggles |
| `~/.openclaw/.env` | Secrets (Discord token, Brave key, etc) |
| `~/.openclaw/workspace/.env.nyanbook` | NyanBook tokens |
| `~/.openclaw/workspace/.github-token` | GitHub PAT |

## Graceful Degradation

All cascades follow: **expensive/detailed first → cheap/free last**. See `reference/CASCADE-ARCHITECTURE.md`.

---

*Add whatever helps you do your job. This is your cheat sheet.*
