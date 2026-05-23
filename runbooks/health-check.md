# Health Check & Self-Resuscitation Protocol

Run by: `health-monitor` cron job (every 6 hours)
Session: isolated (no Discord leakage)
Delivery: silent unless alert conditions met

## §Checks

1. `openclaw gateway status` — must report `Runtime: running`
2. `openclaw config validate` — must report `Config valid`
3. `openclaw doctor --lint --json` — capture any `warning` or `error` severity findings
4. Disk usage: `df -h /` — alert if >80%

## §StateFile

Read and write: `~/.openclaw/.last-health-state.json`

Schema:
```json
{
  "timestamp": "ISO-8601",
  "gatewayRunning": true,
  "configValid": true,
  "doctorFindings": [],
  "diskPercent": 42
}
```

## §AlertRules

Post to Discord **only if** any of the following are true:
- `gatewayRunning` changed from true → false
- `configValid` changed from true → false
- `doctorFindings` has new `warning` or `error` not present in last state
- `diskPercent` > 80
- This is the **first run ever** (no state file exists)

Otherwise, append one line to `~/.openclaw/logs/health.log` and exit silently.

## §SelfResuscitation

If gateway is not running:
1. `openclaw gateway restart`
2. Wait 10s, re-run `openclaw gateway status`
3. If still down → post CRITICAL alert to Discord

## §LogFormat

```
YYYY-MM-DD HH:MM:SS [OK|ALERT] <one-line summary>
```

## §Tone

If alerting: concise, factual, no emoji spam. One message with bullet findings.
If silent: do not speak.
