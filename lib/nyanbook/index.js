/**
 * lib/nyanbook/index.js — Unified nyanbook package entry point
 * Replaces legacy lib/nyan-router.js. Everything nyanbook in one require.
 *
 * Usage:
 *   const nyanbook = require('./lib/nyanbook');
 *   await nyanbook.ledgerAppend({ text: 'hello' });
 *   const psi = await nyanbook.nyanPsiEma(['AAPL']);
 */

// ─── Config ────────────────────────────────────────────────────────
const config = require('./config');

// ─── Ledger (Book 1 + Book 2) ──────────────────────────────────────
const ledger = require('./ledger');

// ─── Playground (AI inference) ─────────────────────────────────────
const playground = require('./playground');

// ─── Cascade (context-router integration) ─────────────────────────
const cascade = require('./cascade');

// ─── Unified exports ───────────────────────────────────────────────
module.exports = {
  // Config & auth
  ...config,

  // Ledger (append-only storage)
  ledgerAppend: ledger.ledgerAppend,
  ledgerRead: ledger.ledgerRead,
  ledgerHealth: ledger.ledgerHealth,

  // Playground (AI inference)
  nyanHealth: playground.nyanHealth,
  nyanQuery: playground.nyanQuery,
  nyanPsiEma: playground.nyanPsiEma,
  nyanSmartRoute: playground.nyanSmartRoute,
  shouldUsePsiEma: playground.shouldUsePsiEma,
  extractTickers: playground.extractTickers,

  // Cascade (grounding router)
  nyanGrounding: cascade.nyanGrounding,
  formatPsiEma: cascade.formatPsiEma,

  // Legacy compat alias (deprecated, use nyanQuery instead)
  nyanParallel: async (prompt, opts = {}) => {
    const { history = [] } = opts;
    const result = await playground.nyanQuery(prompt, history);
    return { source: 'nyan-parallel', nyan: result, prompt };
  },
};
