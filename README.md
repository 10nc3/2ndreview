# OpenClaw Agent

Lean agent configuration for OpenClaw. Optimized for 32K context budget on local Gemma3-4B.

## Structure

```
.
├── AGENTS.md           # Core: gating, modes, red lines (~750 tok)
├── SOUL.md             # Personality (~480 tok)
├── IDENTITY.md         # Agent identity (~190 tok)
├── USER.md             # Human context (~150 tok)
├── HEARTBEAT.md        # Heartbeat checklist (~60 tok, heartbeat only)
├── runbooks/
│   └── health-check.md # Tier 2: errors, audit, resuscitation (load on demand)
├── reference/          # Tier 2: loaded on trigger keywords only
│   ├── PHILOSOPHY.md   # Load on philosophy queries
│   └── TOOLS.md        # Load on tool errors / "what tools?"
├── config/             # Credential templates (safe to commit)
│   ├── .env.example
│   ├── openclaw.json.template
│   ├── secrets.template.json
│   └── push-with-pat   # Secure push helper
├── memory/             # Daily logs, mode state (gitignored)
└── README.md
```

## Context Budget

| Bucket | Tokens | What |
|--------|--------|------|
| Soul + identity | ~1,500 | AGENTS.md + SOUL.md + IDENTITY.md + USER.md |
| Tool schemas | ~3,000 | OpenClaw injects |
| Session transcript | ~8,000 | Last ~10 message pairs |
| User message | ~500 | Typical |
| **Steady-state** | **~13,500** | Leaves ~18K headroom on 32K Gemma |
| Tier 2 burst | +10,000 | RUNBOOK.md or reference/ when triggered |

## Gating

| Mode | Who | What |
|------|-----|------|
| **describe** | Anyone | Chat, Q&A |
| **scribe** | Server members | Write, draft, read, search |
| **prescribe** | Owner only | Code, execution, file writes |

## Build / Plan / Answer

| Mode | Who | Constraints |
|------|-----|-------------|
| **answer** | Anyone | Default. Append-only, no delete. |
| **plan** | Owner | Design, architect, draft. No execution. |
| **build** | Owner | **Only after approved plan.** Execute. |

Current mode: `memory/current-mode.json`

## Security

- No credentials in repo. All templates use placeholders.
- Real secrets in `~/.openclaw/openclaw.json` (outside git).
- PAT stored in `~/.openclaw/.env` (chmod 600).
