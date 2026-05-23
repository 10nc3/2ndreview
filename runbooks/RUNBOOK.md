# RUNBOOK.md — Tier 2

Loaded only on restart events, errors, or explicit request. Not injected every turn.

## Post-Restart Audit Protocol

After every gateway restart, **always** run this checklist and report status. Never fail silent.

1. `openclaw gateway status` — running, reachable, pid matches
2. `openclaw config validate` — no errors
3. `openclaw channels status --probe` — Discord/WhatsApp connected
4. `openclaw config get accessGroups` — owner/scribes loaded
5. Touch `memory/YYYY-MM-DD.md` — write access confirmed
6. Report: ✅ all clear, or ❌ specific failure + next step

**No-fail-silent rule:** If any step fails, report immediately. Retry once after 5s if unreachable. Always end turn with status summary.

## Error Handling & Guard Rails

**Always communicate status. Never die silently.** Operational problems are messages to the user.

### Token & Context Budget

- Warn when >50% context window used
- Report `context_length_exceeded` — don't truncate silently
- Summarize or off-load to file/memory
- Out of tokens mid-task: pause, report spend, ask whether to continue

### API / Network Errors

- **4xx:** Report immediately with code + what was attempted
- **5xx:** Retry once, then report failure + retry advice
- **429:** Read `Retry-After`, report wait time, queue or defer
- **Connection drops:** Reconnect once, then report

### Turn-Level Rules

1. Never `NO_REPLY` on error — errors are content
2. Always end with status line — what happened, what's next
3. If tool fails: report tool name + error + fallback plan
4. If can't complete: say why + what would unblock
5. If model refuses / safety-halts: relay refusal verbatim

### Logging

Write operational incidents to `memory/YYYY-MM-DD.md`:
- Restarts, config changes, auth failures
- Rate limits, token exhaustion, model switches
- Any time user had to ask "did you get stuck?"

## Self-Resuscitation (Cron)

Cron `health-monitor` runs every 30 min (Bangkok time), isolated session:

1. Check gateway health + pending tasks
2. If unhealthy AND no pending tasks → `openclaw gateway restart`
3. If pending tasks → skip, log "skipped — pending queue"
4. If restart triggered → poll up to 60s, run post-restart audit
5. Report ONLY if restart failed or audit found issues

**Safety:** Never restart if tasks pending. Timeout/retry auto-populated (60s × 5). Failure alert after 2 consecutive failures, 5-min cooldown.

## Mode Commands Reference

- `"plan mode"` / `"build mode"` / `"answer mode"` — owner only
- `"what mode are we in?"` — anyone
- `"show the plan"` — anyone
- `"approve plan"` — owner only

**Safety:** Never silently switch modes. Build without approved plan → "Switch to plan mode first?" Non-owner requests plan/build → "Owner-only. I'm in answer mode for you."
