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

const TIERS = [
  {
    name: 'kimi-k2.6',
    provider: 'openrouter',
    model: 'openrouter/moonshotai/kimi-k2.6',
    cost: 'api',
    quality: 'high',
    timeoutMs: 60000,
    maxRetries: 2
  },
  {
    name: 'openrouter-auto',
    provider: 'openrouter',
    model: 'openrouter/auto',
    cost: 'api',
    quality: 'medium',
    timeoutMs: 60000,
    maxRetries: 1
  },
  {
    name: 'gemma4-e4b',
    provider: 'ollama',
    model: 'ollama/gemma4:e4b',
    cost: 'local',
    quality: 'low',
    baseUrl: 'http://localhost:11434',
    timeoutMs: 120000,
    maxRetries: 1
  }
];

function getAvailableTiers() {
  return TIERS.filter(t => !isDemoted(t.provider));
}

/**
 * Select best available tier for a task
 * @param {string} intent — from temperature-router (deterministic, reasoning, creative, etc)
 * @returns {Object} tier config
 */
function selectTier(intent = 'balanced') {
  const available = getAvailableTiers();
  if (available.length === 0) {
    // All demoted — force gemma (local doesn't strike)
    return TIERS[2];
  }

  // For deterministic/math tasks: prefer kimi; for creative: also kimi
  // Gemma is always last resort
  return available[0];
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
    try {
      const result = await Promise.race([
        invokeFn(tier),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), tier.timeoutMs)
        )
      ]);

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
      demoted: isDemoted(t.provider),
      ready: !isDemoted(t.provider)
    })),
    strikes: getStrikeStatus()
  };
}

module.exports = { TIERS, selectTier, callWithCascade, getStatus };
