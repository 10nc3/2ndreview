# Cascade Architecture v1.3

Graceful degradation across all external tools. Expensive/detailed first, cheap/free last.

## Unified Entry Point

```js
const cascades = require('./lib/cascade-index');
const status = cascades.getStatus();
```

---

## 1. Search Cascade

**File:** `lib/search-cascade.js`

| Tier | Provider | Cost | Quality | Fallback Trigger |
|------|----------|------|---------|-----------------|
| 0 | Perplexity | API key | High | Not configured |
| 1 | Brave | API key (configured) | Medium | 429, timeout, error |
| 2 | DDG | Free | Low (lossy) | Always available |

```js
const { results, source, tier, lossy, fallbackTrail } = await cascades.search("seed metric singapore");
```

### Configuration

Perplexity requires `PPLX_API_KEY` in `~/.openclaw/.env`.

---

## 2. Math Cascade

**File:** `lib/math-cascade.js`

| Tier | Tool | Cost | Quality | Use Case |
|------|------|------|---------|----------|
| 1 | Wolfram Alpha | API key | Authoritative | Verification, complex calc |
| 2 | Local math | Free | Deterministic | φ-based, zero latency |
| 3 | Generic LLM | API/local | Heuristic | Last resort, tagged unverified |

```js
const { result, tier, deterministic } = await cascades.math("700 * 1500 / 12000", {
  localType: 'seed-metric',
  localParams: { city: 'Bangkok', year: 2026, landPricePerSqm: 1500, medianIncome: 12000 }
});
```

### Configuration

Wolfram requires `WOLFRAM_APP_ID` in `~/.openclaw/.env`.

---

## 3. Model Cascade

**File:** `lib/model-cascade.js`

| Tier | Model | Provider | Cost | Strike Threshold |
|------|-------|----------|------|-----------------|
| 1 | Kimi K2.6 | OpenRouter | API | 3 failures → demote |
| 2 | OpenRouter/auto | OpenRouter | API | 3 failures → demote |
| 3 | Gemma4 E4B | Ollama local | Free | Never strikes |

```js
const result = await cascades.model(async (tier) => {
  // your LLM call here using tier.model
  return await openrouter.chat(tier.model, prompt);
}, { intent: 'reasoning' });

console.log(result._provenance);
// { model, provider, latencyMs, tier, fallbackTrail }
```

### Strike-Chain Integration

Uses `lib/strike-chain.js`: 3 failures → demote, 5min cooldown → auto-recover.

---

## 4. PDF Cascade

**File:** `lib/pdf-cascade.js`

| Tier | Tool | Quality | Requirement |
|------|------|---------|-------------|
| 1 | pdftotext (poppler) | High | `brew install poppler` |
| 2 | nano-pdf skill | Medium | Already enabled |
| 3 | Raw heuristic | Low | No requirements |

```js
const { text, tier, lossy } = await cascades.pdf('/path/to/file.pdf');
```

---

## DataPackage Integration

Every cascade result includes `_provenance` or `fallbackTrail` compatible with `utils/data-package.js`:

```js
pkg.writeStage('S4', {
  cascade: 'search',
  tier: result.tier,
  lossy: result.lossy || false,
  fallbackTrail: result.fallbackTrail,
  latencyMs: result.latencyMs
});
```

---

## Status Dashboard

```js
const status = cascades.getStatus();
// {
//   search: { tiers: [...] },
//   math: { wolfram: { available: false }, localMath: [...] },
//   model: { tiers: [...], strikes: {...} },
//   pdf: { tiers: [...], ready: true }
// }
```

---

*nyan~ 🔥 — Cascades protect against void.*
