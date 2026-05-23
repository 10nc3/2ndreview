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

let wolframAppId = null;

try {
  wolframAppId = process.env.WOLFRAM_APP_ID || null;
} catch {
  wolframAppId = null;
}

async function queryWolfram(expression) {
  if (!wolframAppId) {
    return { error: 'WOLFRAM_APP_ID not set', tier: 'wolfram' };
  }
  const url = `https://api.wolframalpha.com/v1/result?appid=${wolframAppId}&i=${encodeURIComponent(expression)}`;
  try {
    const res = await fetch(url, { timeout: 15000 });
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

async function queryGenericLLM(expression, modelFn) {
  // modelFn is a callback: (prompt) => Promise<string>
  if (!modelFn) {
    return { error: 'No LLM function provided', tier: 'llm' };
  }
  const prompt = `Calculate or verify: ${expression}\nRespond with ONLY the final answer, no explanation.`;
  try {
    const result = await modelFn(prompt);
    return { result, tier: 'llm', heuristic: true, verified: false };
  } catch (e) {
    return { error: e.message, tier: 'llm' };
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
  const { localType, localParams, modelFn } = opts;

  // Tier 1: Wolfram (if key available)
  if (wolframAppId) {
    const w = await queryWolfram(expression);
    if (!w.error) return w;
  }

  // Tier 2: Local deterministic math
  if (localType) {
    const l = queryLocalMath(localType, localParams || {});
    if (!l.error) return l;
  }

  // Tier 3: Generic LLM heuristic
  return queryGenericLLM(expression, modelFn);
}

function getStatus() {
  return {
    wolfram: { available: !!wolframAppId, appIdMask: wolframAppId ? wolframAppId.slice(0, 4) + '…' : null },
    localMath: ['seed-metric', 'psi-ema', 'solve-identity', 'classify'],
    llm: { available: true, note: 'heuristic only, unverified' }
  };
}

module.exports = { mathCascade, queryWolfram, queryLocalMath, queryGenericLLM, getStatus };
