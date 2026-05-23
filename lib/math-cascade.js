/**
 * lib/math-cascade.js — Tiered math verification
 *
 * Tiers (expensive → cheap):
 *   1. Wolfram Alpha (authoritative, API key required)
 *   2. Local math (psi-ema, seed-metric — deterministic, zero cost)
 *   3. Generic LLM (heuristic only, tagged unverified)
 */

const { measureAffordability, solveIdentity, PHI } = require('./math/seed-metric');
const { computePsiEMA, classifyRegime } = require('./math/psi-ema');

// FIX #34: Read once at module load. Single source of truth — no more
// duplicate `if (wolframAppId)` checks scattered through the file.
const WOLFRAM_APP_ID = process.env.WOLFRAM_APP_ID || null;
const WOLFRAM_AVAILABLE = !!WOLFRAM_APP_ID;
const DEFAULT_LLM_TIMEOUT_MS = 30000;

// FIX #7: Centralised timeout helper (matches the pattern used elsewhere).
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms).unref?.();
  return ctrl.signal;
}

async function queryWolfram(expression) {
  if (!WOLFRAM_AVAILABLE) {
    return { error: 'WOLFRAM_APP_ID not set', tier: 'wolfram' };
  }
  // FIX #25: coerce expression to string. Passing undefined/object/number
  // to encodeURIComponent silently produced "undefined", "[object Object]"
  // or threw on symbols. Reject empty input up front.
  const expr = expression == null ? '' : String(expression).trim();
  if (!expr) return { error: 'empty expression', tier: 'wolfram' };

  const url = `https://api.wolframalpha.com/v1/result?appid=${encodeURIComponent(WOLFRAM_APP_ID)}&i=${encodeURIComponent(expr)}`;
  try {
    // FIX #7: fetch's `timeout` option doesn't exist — use AbortSignal.
    const res = await fetch(url, { signal: timeoutSignal(15000) });
    if (!res.ok) throw new Error(`Wolfram: ${res.status}`);
    const text = await res.text();
    return { result: text, tier: 'wolfram', authoritative: true };
  } catch (e) {
    return { error: e.message, tier: 'wolfram' };
  }
}

function queryLocalMath(type, params) {
  switch (type) {
    case 'seed-metric':
      return { result: measureAffordability(params), tier: 'local', deterministic: true };
    case 'solve-identity':
      return { result: solveIdentity(params.sigma || 0), tier: 'local', deterministic: true };
    case 'psi-ema':
      return { result: computePsiEMA(params.prices), tier: 'local', deterministic: true };
    case 'classify':
      return { result: classifyRegime(params.R, params.z), tier: 'local', deterministic: true };
    default:
      return { error: `Unknown local math type: ${type}`, tier: 'local' };
  }
}

// FIX #24: Wrap modelFn in a clearable timeout. A hung LLM call previously
// stalled the whole cascade indefinitely (modelFn awaited with no race).
async function queryGenericLLM(expression, modelFn, opts = {}) {
  if (!modelFn) {
    return { error: 'No LLM function provided', tier: 'llm' };
  }
  const timeoutMs = opts.timeoutMs || DEFAULT_LLM_TIMEOUT_MS;
  const prompt = `Calculate or verify: ${expression}\nRespond with ONLY the final answer, no explanation.`;

  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`LLM tier timeout after ${timeoutMs}ms`)), timeoutMs);
    timeoutId.unref?.();
  });

  try {
    const result = await Promise.race([modelFn(prompt), timeoutPromise]);
    return { result, tier: 'llm', heuristic: true, verified: false };
  } catch (e) {
    return { error: e.message, tier: 'llm' };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Math query with cascade
 * @param {string} expression — math expression or query
 * @param {Object} opts
 * @param {string} [opts.localType] — 'seed-metric' | 'psi-ema' | etc
 * @param {Object} [opts.localParams] — params for local math
 * @param {Function} [opts.modelFn] — LLM callback for heuristic tier
 */
async function mathCascade(expression, opts = {}) {
  const { localType, localParams, modelFn, llmTimeoutMs } = opts;

  // Tier 1: Wolfram (if key available) — single check, queryWolfram also
  // guards but this lets us skip the await entirely.    FIX #34
  if (WOLFRAM_AVAILABLE) {
    const w = await queryWolfram(expression);
    if (!w.error) return w;
  }

  // Tier 2: Local deterministic math
  if (localType) {
    const l = queryLocalMath(localType, localParams || {});
    if (!l.error) return l;
  }

  // Tier 3: Generic LLM heuristic
  return queryGenericLLM(expression, modelFn, { timeoutMs: llmTimeoutMs });
}

function getStatus() {
  return {
    wolfram: {
      available: WOLFRAM_AVAILABLE,
      appIdMask: WOLFRAM_APP_ID ? WOLFRAM_APP_ID.slice(0, 4) + '…' : null,
    },
    localMath: ['seed-metric', 'psi-ema', 'solve-identity', 'classify'],
    llm: { available: true, note: 'heuristic only, unverified', defaultTimeoutMs: DEFAULT_LLM_TIMEOUT_MS },
  };
}

module.exports = { mathCascade, queryWolfram, queryLocalMath, queryGenericLLM, getStatus };
