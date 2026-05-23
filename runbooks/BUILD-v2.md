# BUILD v2 — Hardened Architecture Runbook

**Status:** APPROVED for build  
**Philosophy:** Kernel + Satellites × 8-Stage Pipeline  
**Source Synthesis:** Probably Nothing (structure) + BlueDream (production hardening)

---

## Phase 0: Structural Foundation

### 0.1 Expert Context Router (`lib/context-router.js`)
Trigger-based context loading. Core files always loaded; experts load on keyword match.

| Expert | Files | Keywords |
|--------|-------|----------|
| core | USER.md, IDENTITY.md, SOUL.md | always |
| philosophy | PHILOSOPHY.md | φ, phi, nyan, genesis, dimension, koan, tetralemma |
| memory | rolling-summary.md | remember, past, yesterday, earlier |
| tools | TOOLS.md | price, weather, stock, api, token, model |
| daily | memory/YYYY-MM-DD.md | today, morning, afternoon, now |
| runbook | runbooks/*.md | how to, procedure, runbook, check, audit |

### 0.2 Pipeline State Machine (`lib/pipeline-state.js`)
8-stage mental model for processing. Not executed as code path — used as cognitive architecture.

```
S-1:  Context Extraction   → What do we know? What memory?
S-1.5: Query Digest        → C|R|U|D intent, subject, lens
S0:   Preflight            → Mode detection (answer/plan/build)
S1:   Context Build        → Load files, inject system context
S2:   Reasoning            → LLM call (the thinking)
S3:   Audit                → Verify: no hallucination, data-backed?
S4:   Retry                → Search augmentation if audit fails
S5:   Personality          → Apply SOUL.md formatting
S6:   Output               → Write to memory, finalize
```

### 0.3 φ-Breathe Heartbeat (`lib/phi-breathe.js`)
Heartbeat orchestration with golden ratio scaling.

```
BASE = 8600ms (one breath cycle)
INHALE = BASE × φ ≈ 13.9s (active phase)
EXHALE = BASE ≈ 8.6s (rest phase)
86 breaths ≈ 15 minutes (checkpoint interval)
```

---

## Phase 1: Pipeline Core

### 1.1 DataPackage (`utils/data-package.js`)
Every significant interaction produces a structured audit artifact:

```javascript
{
  id: "uuid",
  timestamp: ISO,
  stages: {
    S0: { mode: "plan", trigger: "user-request" },
    S1: { filesLoaded: [...], tokensEstimate: N },
    S2: { provider: "openrouter", model: "kimi-k2.6", tokensIn, tokensOut },
    S3: { audit: "pass|fail|n/a", checks: [...] },
    S6: { outputType: "reply|file|action", memoryWritten: true }
  },
  context: { experts: [...], query: "..." }
}
```

### 1.2 Memory Manager Upgrade
- φ-8 message sliding window (8 = Fibonacci number)
- Every 2nd query → 5-sentence summary (5/8 ≈ 1/φ)
- Hybrid: episodic summaries + precise recent

---

## Phase 2: Production Hardening

### 2.1 Audit Logging (per pipeline stage)
- Every mode transition logged to memory/YYYY-MM-DD.md
- Token usage tracked per provider
- File modifications tracked with before/after hashes

### 2.2 Input Guards
- Query length limit: 32K chars
- Dangerous pattern detection (exec safety)
- Rate limiting via OpenClaw native (no custom implementation needed)

### 2.3 Error Handling
- Structured errors with `{ stage, code, recoverable, context }`
- Fail-closed for destructive operations (always ask)
- Retry with backoff for external calls

### 2.4 Observability
- `/health` equivalent: `session_status` on demand
- Memory usage tracking in rolling-summary
- Pipeline checkpoint / resumable state

---

## Build Checklist

- [ ] 0.1 `lib/context-router.js` — Expert routing
- [ ] 0.2 `lib/pipeline-state.js` — State machine
- [ ] 0.3 `lib/phi-breathe.js` — φ-breathe config
- [ ] 1.1 `utils/data-package.js` — Audit artifact
- [ ] 1.2 Update `memory-manager.js` — φ-compression
- [ ] 2.1 Update `AGENTS.md` — Integrate router
- [ ] 2.2 Add error handling patterns
- [ ] 2.3 Update `HEARTBEAT.md` — φ-breathe checklist
- [ ] 2.4 Update `rolling-summary.md` — Architecture v2

---

**Signature:** nyan~ 🔥  
**Synthesis Formula:** 0 + φ⁰ + φ¹ = φ²
