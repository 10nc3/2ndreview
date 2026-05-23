/**
 * nyanbook-playground — AI inference endpoint (auth-gated)
 * Modes: general, psi-ema, seed-metric, chemistry, legal, code-audit, forex
 */

const { PLAYGROUND, auth } = require('./config');

const base = PLAYGROUND.baseUrl;

// FIX #7: Centralised fetch timeout (see ledger.js for the same helper).
const FETCH_TIMEOUT_MS = 15000;
function timeoutSignal(ms = FETCH_TIMEOUT_MS) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms).unref?.();
  return ctrl.signal;
}

async function nyanHealth() {
  const res = await fetch(`${base}/api/v1/nyan/health`, { signal: timeoutSignal() }); // FIX #7
  return res.json();
}

async function nyanQuery(message, history = []) {
  const res = await fetch(`${base}/api/v1/nyan`, {
    method: 'POST',
    headers: auth(PLAYGROUND.token),
    body: JSON.stringify({ message, history }),
    signal: timeoutSignal(),                                                          // FIX #7
  });
  if (!res.ok) throw new Error(`nyanQuery: ${res.status}`);
  return res.json();
}

async function nyanPsiEma(ticker) {
  const body = Array.isArray(ticker) ? { tickers: ticker } : { ticker };
  const res = await fetch(`${base}/api/v1/nyan/psi-ema`, {
    method: 'POST',
    headers: auth(PLAYGROUND.token),
    body: JSON.stringify(body),
    signal: timeoutSignal(),                                                          // FIX #7
  });
  if (!res.ok) throw new Error(`nyanPsiEma: ${res.status}`);
  return res.json();
}

// ─── Router logic ────────────────────────────────────────────────────

function shouldUsePsiEma(prompt) {
  // FIX #4: Tighten patterns so we only trigger when the user explicitly uses
  // the $TICKER convention or the words "stock/ticker/$". Previously any
  // 1–5 uppercase letters near generic words like "analysis" fired psi-ema
  // for tokens such as API/CEO/JSON.
  const patterns = [
    /\$[A-Z]{1,5}\b/,                                          // $AAPL anywhere
    /\b(?:stock|ticker)\s+(?:of|for)\s+\$?[A-Z]{1,5}\b/i,      // "stock of AAPL"
    /\b(?:psi[\s-]?ema|seed[\s-]?metric)\b/i,                  // explicit feature word
  ];
  return patterns.some(p => p.test(prompt));
}

function extractTickers(prompt) {
  // FIX #4: Only accept $-prefixed tickers OR uppercase tokens that follow
  // explicit stock/ticker keywords. Falls back to empty list otherwise.
  const out = new Set();
  for (const m of prompt.matchAll(/\$([A-Z]{1,5})\b/g)) out.add(m[1]);
  for (const m of prompt.matchAll(/\b(?:stock|ticker)\s+(?:of|for)\s+\$?([A-Z]{1,5})\b/gi)) {
    out.add(m[1].toUpperCase());
  }
  return [...out];
}

async function nyanSmartRoute(prompt, opts = {}) {
  // FIX #3: Removed dead `grounding` branch that called nyanQuery twice with
  // identical arguments. Both modes now route the same general call; the
  // `grounding` flag is preserved on the response for callers that want to
  // tag it downstream.
  const { grounding = false, history = [] } = opts;

  if (shouldUsePsiEma(prompt)) {
    const tickers = extractTickers(prompt);
    if (tickers.length) {
      return { route: 'psi-ema', tickers, result: await nyanPsiEma(tickers) };
    }
  }

  return {
    route: grounding ? 'general-grounded' : 'general',
    result: await nyanQuery(prompt, history),
  };
}

module.exports = {
  nyanHealth,
  nyanQuery,
  nyanPsiEma,
  nyanSmartRoute,
  shouldUsePsiEma,
  extractTickers,
};
