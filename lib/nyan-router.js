/**
 * nyan-router — RE-EXPORT wrapper
 * Convenience module: require('./nyan-router') gets you both halves
 */

const playground = require('./nyanbook/playground');
const ledger = require('./nyanbook/ledger');

module.exports = {
  // Playground (AI inference)
  ...playground,

  // Ledger (append-only storage)
  ledgerAppend: ledger.ledgerAppend,

  // Legacy compat
  nyanParallel: async (prompt, opts = {}) => {
    const { mode = 'parallel', history = [] } = opts;
    if (mode === 'fast') return { source: 'native', prompt };
    const result = await playground.nyanQuery(prompt, history);
    return { source: 'nyan-parallel', nyan: result, prompt };
  },
};
