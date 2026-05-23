/**
 * nyanbook-playground — AI inference endpoint (auth-gated)
 * Modes: general, psi-ema, seed-metric, chemistry, legal, code-audit, forex
 */

const { PLAYGROUND, auth } = require('./config');

const base = PLAYGROUND.baseUrl;

async function nyanHealth() {
  const res = await fetch(`${base}/api/v1/nyan/health`);
  return res.json();
}

async function nyanQuery(message, history = []) {
  const res = await fetch(`${base}/api/v1/nyan`, {
    method: 'POST',
    headers: auth(PLAYGROUND.token),
    body: JSON.stringify({ message, history }),
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
  });
  if (!res.ok) throw new Error(`nyanPsiEma: ${res.status}`);
  return res.json();
}

// ─── Router logic ────────────────────────────────────────────────────

function shouldUsePsiEma(prompt) {
  const patterns = [
    /\b[A-Z]{1,5}\b.*?(?:price|stock|ticker|ema|rsi|chart)/i,
    /\b[A-Z]{1,5}\b.*?\bbea?ta\b/i,
    /\b(?:stock|ticker)\s+(?:of|for)\s+([A-Z]{1,5})/i,
    /\b(?:\$[A-Z]{1,5}|\b[A-Z]{1,5})\b.*?(?:analysis|forecast|metric)/i,
  ];
  return patterns.some(p => p.test(prompt));
}

function extractTickers(prompt) {
  const m = prompt.match(/\b[A-Z]{1,5}\b/g) || [];
  return [...new Set(m)];
}

async function nyanSmartRoute(prompt, opts = {}) {
  const { grounding = false, history = [] } = opts;

  if (shouldUsePsiEma(prompt)) {
    const tickers = extractTickers(prompt);
    if (tickers.length) {
      return { route: 'psi-ema', tickers, result: await nyanPsiEma(tickers) };
    }
  }

  return {
    route: 'general',
    result: grounding
      ? await nyanQuery(prompt, history) // caller merges
      : await nyanQuery(prompt, history),
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
