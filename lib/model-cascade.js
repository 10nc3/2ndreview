/**
 * lib/model-cascade.js — Formalized model fallback with strike-chain integration
 *
 * Tiers (expensive → cheap):
 *   1. Kimi K2.6 (OpenRouter) — primary, best reasoning
 *   2. OpenRouter/auto — automatic fallback on OpenRouter side
 *   3. Gemma4 E4B (Ollama local) — always free, always available
 *
 * Strike-chain: 3 failures → demote, 5min cooldown → retry tier 1
 * Provenance: every call tagged with model, provider, latency
 */

const { recordStrike, recordSuccess, isDemoted, getStatus: getStrikeStatus } = require('./strike-chain');

// FIX #23: Ollama base URL was hardcoded to localhost:11434, which broke
// any deployment running Ollama on a remote host. Pull from env first.
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

const TIERS = [
  {
    name: 'kimi-k2.6',
    provider: 'openrouter',
    model: 'openrouter/moonshotai/kimi-k2.6',
    cost: 'api',
    quality: 'high',
    timeoutMs: 60000,
    maxRetries: 2,
    intents: ['reasoning', 'deterministic', 'balanced'],          // FIX #21
  },
  {
    name: 'openrouter-auto',
    provider: 'openrouter',
    model: 'openrouter/auto',
    cost: 'api',
    quality: 'medium',
    timeoutMs: 60000,
    maxRetries: 1,
    intents: ['creative', 'balanced'],                            // FIX #21
  },
  {
    name: 'gemma4-e4b',
    provider: 'ollama',
    model: 'ollama/gemma4:e4b',
    cost: 'local',
    quality: 'low',
    baseUrl: OLLAMA_BASE_URL,                                     // FIX #23
    timeoutMs: 120000,
    maxRetries: 1,
    intents: ['fallback', 'balanced'],                            // FIX #21
  }
];

function getAvailableTiers() {
  return TIERS.filter(t => !isDemoted(t.provider));
}

/**
 * Select best available tier for a task
 * @param {string} intent — from temperature-router (deterministic, reasoning, creative, etc)
 * @returns {Object} tier config
 *
 * FIX #21: Previously the `intent` parameter was accepted but ignored —
 * the function always returned `available[0]`. Now we actually consult the
 * per-tier `intents` allowlist and fall back to the highest-quality
 * available tier when no tier opts in.
 */
function selectTier(intent = 'balanced') {
  const available = getAvailableTiers();
  if (available.length === 0) {
    return TIERS[TIERS.length - 1]; // gemma local, never strikes
  }
  const match = available.find(t => Array.isArray(t.intents) && t.intents.includes(intent));
  return match || available[0];
}

/**
 * Call a model tier with strike tracking
 * Wraps the actual LLM call; caller provides the invoke function
 */
async function callWithCascade(invokeFn, opts = {}) {
  const { intent = 'balanced', fallbacks = true, onStrike = null } = opts;
  const tiers = fallbacks ? getAvailableTiers() : [selectTier(intent)];
  const trail = [];

  for (const tier of tiers) {
    const startMs = Date.now();
    // FIX #22: The previous setTimeout in Promise.race was never cleared.
    // If invokeFn resolved quickly the timer still fired (or held the event
    // loop open). Wrap with a clearable handle and always clearTimeout in
    // the finally block.
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), tier.timeoutMs);
      // Don't keep the process alive just for this timer.
      timeoutId.unref?.();
    });
    try {
      const result = await Promise.race([invokeFn(tier), timeoutPromise]);
      recordSuccess(tier.provider);
      return {
        ...result,
        _provenance: {
          model: tier.model,
          provider: tier.provider,
          latencyMs: Date.now() - startMs,
          tier: tier.name,
          fallbackTrail: trail.length ? trail : null
        }
      };
    } catch (err) {
      recordStrike(tier.provider, err.message);
      trail.push({
        tier: tier.name,
        provider: tier.provider,
        error: err.message,
        latencyMs: Date.now() - startMs
      });
      if (onStrike) onStrike(tier, err);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);                     // FIX #22
    }
  }

  return {
    error: 'All model tiers exhausted',
    _provenance: { fallbackTrail: trail }
  };
}

function getStatus() {
  return {
    tiers: TIERS.map(t => ({
      name: t.name,
      provider: t.provider,
      intents: t.intents || [],                                   // FIX #21
      demoted: isDemoted(t.provider),
      ready: !isDemoted(t.provider)
    })),
    ollamaBaseUrl: OLLAMA_BASE_URL,                               // FIX #23
    strikes: getStrikeStatus()
  };
}

module.exports = { TIERS, selectTier, callWithCascade, getStatus };
