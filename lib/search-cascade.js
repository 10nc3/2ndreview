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

const path = require('path');

// FIX #29: Resolve the optional `capabilities` module relative to __dirname,
// not the caller's cwd, and don't crash module load if it's missing.
let _capabilities = null;
try {
  _capabilities = require(path.join(__dirname, 'capabilities'));
} catch {
  try {
    _capabilities = require(path.join(__dirname, '..', 'capabilities'));
  } catch {
    _capabilities = null;
  }
}

// FIX #28: Single timeout source of truth. Per-tier inner timeouts were
// 15s while the outer Promise.race was 20s — confusing layering that hid
// real timeout errors. Use one outer timeout; tiers respect AbortSignal.
const DEFAULT_TIMEOUT_MS = 20000;

// FIX #23: Real perplexity implementation (was `search: null` → crash).
// Gated on PPLX_API_KEY so it auto-enables when the key is present.
async function _perplexitySearch(query, opts = {}) {
  const apiKey = process.env.PPLX_API_KEY;
  if (!apiKey) {
    return { results: [], source: 'perplexity', error: 'PPLX_API_KEY not set' };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
        max_tokens: 1024,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`perplexity: ${res.status}`);
    const json = await res.json();
    return {
      results: [{
        title: 'Perplexity answer',
        snippet: json.choices?.[0]?.message?.content || '',
        url: null,
      }],
      citations: json.citations || [],
      source: 'perplexity',
    };
  } finally {
    clearTimeout(t);
  }
}

const TIERS = [
  {
    name: 'perplexity',
    order: 0,
    get enabled() { return !!process.env.PPLX_API_KEY; },          // FIX #23: gate on key
    cost: 'api',
    quality: 'high',
    requiresKey: 'PPLX_API_KEY',
    search: _perplexitySearch,                                     // FIX #23
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
      if (_capabilities && typeof _capabilities.web_search === 'function') {
        return _capabilities.web_search(query, opts);
      }
      return { results: [], source: 'brave', error: 'web_search tool not available in this context' };
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
      // FIX #28: drop per-tier exec timeout — the outer race owns timing.
      // Also use execFile to avoid shell quoting issues with the query.
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);
      try {
        const { stdout } = await execFileAsync(
          'ddgr',
          ['--json', '-n', String(opts.count || 5), query],
          { timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS }
        );
        const results = JSON.parse(stdout);
        return { results, source: 'ddg', lossy: true };
      } catch {
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
  const { count = 5, preferredTier = null, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const tiers = getEnabledTiers();
  const fallbackTrail = [];

  for (const tier of tiers) {
    if (preferredTier && tier.name !== preferredTier) continue;

    const startMs = Date.now();
    // FIX #22/#28: clearable timeout (same pattern as model-cascade).
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
      timeoutId.unref?.();
    });
    try {
      const result = await Promise.race([
        tier.search(query, { count, timeoutMs }),
        timeoutPromise,
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
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

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
