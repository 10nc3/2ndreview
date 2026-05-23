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
          snippet: formatPsiEma(data),
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

function formatPsiEma(result) {
  if (!result?.psiEma?.daily) return '';
  const d = result.psiEma.daily;
  return `[${result.ticker} $${result.currentPrice} | θ=${d.theta?.toFixed(2)} z=${d.z?.toFixed(2)} R=${d.R?.toFixed(2)} | ${d.regime}]`;
}

module.exports = { nyanGrounding, formatPsiEma };
