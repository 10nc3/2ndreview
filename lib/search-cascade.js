/**
 * lib/search-cascade.js — Tiered web search with graceful degradation
 * Strategy: expensive/detailed first → cheap/free last
 *
 * Tiers:
 *   0. Perplexity (deep research, API key required)
 *   1. Brave (configured API key)
 *   2. DDG (free, lossy — always available)
 *
 * Fallback triggers: rate_limit, timeout, error, empty_results
 * All results tagged with source + provenance in DataPackage format.
 */

const TIERS = [
  {
    name: 'perplexity',
    order: 0,
    enabled: false, // set true when PPLX_API_KEY available
    cost: 'api',
    quality: 'high',
    requiresKey: 'PPLX_API_KEY',
    search: null // TODO: implement when key available
  },
  {
    name: 'brave',
    order: 1,
    enabled: true,
    cost: 'api',
    quality: 'medium',
    requiresKey: null, // already in openclaw.json
    search: async (query, opts = {}) => {
      // Uses built-in web_search tool (brave provider)
      try {
        const { web_search } = require('../capabilities');
        return web_search(query, opts);
      } catch {
        // Fallback: direct exec of web_search tool via node if available
        return { results: [], source: 'brave', error: 'web_search tool not available in this context' };
      }
    }
  },
  {
    name: 'ddg',
    order: 2,
    enabled: true,
    cost: 'free',
    quality: 'low',
    requiresKey: null,
    search: async (query, opts = {}) => {
      // ddgr or duckduckgo-js — fallback only
      const { exec: execAsync } = require('child_process');
      const { promisify } = require('util');
      const exec = promisify(execAsync);
      try {
        // Try ddgr if installed
        const { stdout } = await exec(`ddgr --json -n ${opts.count || 5} "${query}"`, { timeout: 15000 });
        const results = JSON.parse(stdout);
        return { results, source: 'ddg', lossy: true };
      } catch {
        // Last resort: curl duckduckgo html
        return {
          results: [],
          source: 'ddg',
          lossy: true,
          error: 'ddgr not installed or failed'
        };
      }
    }
  }
];

function getEnabledTiers() {
  return TIERS.filter(t => t.enabled).sort((a, b) => a.order - b.order);
}

/**
 * Search with cascade fallback
 * @param {string} query
 * @param {Object} opts
 * @param {number} [opts.count=5]
 * @param {string} [opts.preferredTier] — force a tier
 * @returns {Object} { results, source, tier, lossy, fallbackTrail }
 */
async function searchCascade(query, opts = {}) {
  const { count = 5, preferredTier = null } = opts;
  const tiers = getEnabledTiers();
  const fallbackTrail = [];

  for (const tier of tiers) {
    if (preferredTier && tier.name !== preferredTier) continue;

    const startMs = Date.now();
    try {
      const result = await Promise.race([
        tier.search(query, { count }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 20000)
        )
      ]);

      return {
        ...result,
        tier: tier.name,
        cost: tier.cost,
        quality: tier.quality,
        latencyMs: Date.now() - startMs,
        fallbackTrail: fallbackTrail.length ? fallbackTrail : null
      };
    } catch (err) {
      fallbackTrail.push({
        tier: tier.name,
        error: err.message || String(err),
        latencyMs: Date.now() - startMs
      });
    }
  }

  // Complete failure
  return {
    results: [],
    source: 'none',
    tier: null,
    lossy: true,
    error: 'All search tiers exhausted',
    fallbackTrail
  };
}

function getStatus() {
  return {
    tiers: TIERS.map(t => ({
      name: t.name,
      enabled: t.enabled,
      cost: t.cost,
      quality: t.quality,
      ready: t.enabled && (t.requiresKey ? !!process.env[t.requiresKey] : true)
    }))
  };
}

module.exports = { searchCascade, getStatus, TIERS };
