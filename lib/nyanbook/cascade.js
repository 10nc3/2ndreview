/**
 * nyanbook-cascade — Context router integration
 * When nyanbook expert is loaded, optionally call playground for grounding
 */

const { nyanQuery, nyanPsiEma, shouldUsePsiEma, extractTickers } = require('./playground');

/**
 * Call when context-router detects 'nyanbook' expert
 * Returns either: psi-ema data, general grounding, or null if skip
 */
async function nyanGrounding(prompt, opts = {}) {
  const { cascade = 'parallel' } = opts; // 'parallel' | 'grounding' | 'skip'

  if (cascade === 'skip') return null;

  try {
    if (shouldUsePsiEma(prompt)) {
      const tickers = extractTickers(prompt);
      if (tickers.length) {
        const data = await nyanPsiEma(tickers);
        return {
          type: 'psi-ema',
          tickers,
          data,
          snippet: formatPsiEma(data, tickers),                  // FIX #5
        };
      }
    }

    if (cascade === 'grounding') {
      const data = await nyanQuery(prompt);
      return {
        type: 'grounding',
        data,
        snippet: data.response?.slice(0, 300),
      };
    }

    return null;
  } catch (e) {
    return { type: 'error', error: e.message };
  }
}

// FIX #5: nyanPsiEma is always called with an array (see playground.js), so
// the response is the multi-ticker shape `{ results: [{ ticker, ... }] }` (or
// possibly `{ tickers: { TICKER: {...} } }`). The old single-ticker path
// (`result.psiEma.daily`) silently returned ''. Handle all three shapes.
function formatPsiEma(result, requestedTickers = []) {
  if (!result) return '';

  // Multi-ticker (array) response
  const arr = Array.isArray(result.results) ? result.results
            : Array.isArray(result.tickers) ? result.tickers
            : null;
  if (arr) {
    return arr.map(r => formatOne(r)).filter(Boolean).join(' ');
  }

  // Multi-ticker (map) response
  if (result.tickers && typeof result.tickers === 'object') {
    return Object.entries(result.tickers)
      .map(([t, r]) => formatOne({ ticker: t, ...r }))
      .filter(Boolean)
      .join(' ');
  }

  // Single-ticker response (legacy shape)
  return formatOne(result) || (requestedTickers.length
    ? `[${requestedTickers.join(',')} — no psi-ema data returned]`
    : '');
}

function formatOne(r) {
  if (!r) return '';
  const d = r.psiEma?.daily ?? r.daily ?? null;
  if (!d) return '';
  const ticker = r.ticker || r.symbol || '?';
  const price = r.currentPrice ?? r.price ?? '?';
  const theta = d.theta != null ? d.theta.toFixed(2) : '?';
  const z = d.z != null ? d.z.toFixed(2) : '?';
  const R = d.R != null ? d.R.toFixed(2) : '?';
  return `[${ticker} $${price} | θ=${theta} z=${z} R=${R} | ${d.regime ?? '?'}]`;
}

module.exports = { nyanGrounding, formatPsiEma };
