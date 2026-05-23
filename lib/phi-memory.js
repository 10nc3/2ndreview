/**
 * lib/phi-memory.js — Two-tier memory: φ-8 graffiti (local) + ledger (IPFS)
 *
 * Tier 1 (ephemeral): Sliding window of last 8 messages. Per-session only.
 *   - Never persisted. Recreated each wake. Graffiti.
 *   - Fast, cheap, zero external calls.
 *
 * Tier 2 (stateless): NyanBook ledger Book 2. IPFS-backed. Append-only.
 *   - Every 2nd query: φ-8 compresses → summary pushed to ledger.
 *   - On session start: pull last N summaries from ledger → bootstrap context.
 *   - Survives restarts, cross-device, searchable.
 */

const { MemoryCompressor } = require('./memory-compress');
let ledger;
try {
  ledger = require('./nyanbook/ledger');
} catch {
  ledger = null;
}

class PhiMemory {
  constructor(sessionId = 'default', opts = {}) {
    this.sessionId = sessionId;
    this.compressor = new MemoryCompressor(sessionId);
    this.opts = {
      ledgerTarget: 'book_2',
      bootstrapCount: 5,        // how many past summaries to pull on init
      pushOnCompress: true,     // auto-push to ledger on φ-compression
      ...opts
    };
    this.bootstrapped = false;
  }

  /**
   * Bootstrap from ledger on session start.
   * Pulls last N summaries and injects them as "previous context".
   */
  async bootstrap() {
    if (this.bootstrapped || !ledger) return { source: 'skipped', reason: 'no ledger' };

    try {
      const entries = await ledger.ledgerRead(this.opts.ledgerTarget, {
        limit: this.opts.bootstrapCount
      });

      const summaries = (entries.messages || [])
        .filter(m => m.text && m.text.includes('φ-summary'))
        .slice(-this.opts.bootstrapCount);

      for (const s of summaries) {
        this.compressor.summaries.push({
          summary: s.text.replace(/^φ-summary:\s*/, ''),
          timestamp: s.timestamp,
          restoredFromLedger: true
        });
      }

      this.bootstrapped = true;
      return {
        source: 'ledger',
        restored: summaries.length,
        summaries: summaries.map(s => s.text?.slice(0, 100))
      };
    } catch (e) {
      return { source: 'error', error: e.message };
    }
  }

  /**
   * Add a message to the ephemeral φ-8 window.
   */
  add(role, content, meta = {}) {
    this.compressor.add(role, content, meta);
  }

  /**
   * Record a query. If compression triggered, optionally push to ledger.
   */
  async bumpQuery() {
    const shouldCompress = this.compressor.bumpQuery();
    if (!shouldCompress) return { compressed: false };

    const summary = this.compressor.compress();
    if (!summary) return { compressed: false, reason: 'empty summary' };

    let pushResult = null;
    if (this.opts.pushOnCompress && ledger) {
      try {
        pushResult = await ledger.ledgerAppend({
          type: 'φ-summary',
          text: `φ-summary: ${summary.summary}`,
          sessionId: this.sessionId,
          queryCount: summary.queryCount,
          messagesCompressed: summary.messagesCompressed,
          timestamp: new Date(summary.timestamp).toISOString()
        }, this.opts.ledgerTarget);
      } catch (e) {
        pushResult = { error: e.message };
      }
    }

    return {
      compressed: true,
      summary: summary.summary,
      pushed: !!pushResult?.success,
      pushResult
    };
  }

  /**
   * Get context for injection: ledger-restored summaries + recent φ-8 window.
   */
  getContext() {
    const local = this.compressor.getContext();
    return {
      ...local,
      sessionId: this.sessionId,
      bootstrapped: this.bootstrapped,
      totalSummaries: this.compressor.summaries.length
    };
  }

  toJSON() {
    return {
      ...this.compressor.toJSON(),
      bootstrapped: this.bootstrapped,
      ledgerTarget: this.opts.ledgerTarget
    };
  }
}

module.exports = { PhiMemory };
