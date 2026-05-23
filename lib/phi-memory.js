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

// FIX #31: Minimum interval between ledger pushes (per session). Prevents a
// runaway compressor or rapid message bursts from spamming the IPFS
// endpoint. Configurable via opts.minPushIntervalMs.
const DEFAULT_MIN_PUSH_INTERVAL_MS = 5000;

class PhiMemory {
  constructor(sessionId = 'default', opts = {}) {
    this.sessionId = sessionId;
    this.compressor = new MemoryCompressor(sessionId);
    this.opts = {
      ledgerTarget: 'book_2',
      bootstrapCount: 5,        // how many past summaries to pull on init
      pushOnCompress: true,     // auto-push to ledger on φ-compression
      minPushIntervalMs: DEFAULT_MIN_PUSH_INTERVAL_MS,           // FIX #31
      ...opts
    };
    this.bootstrapped = false;
    this._lastPushAt = 0;                                       // FIX #31
  }

  /**
   * Bootstrap from ledger on session start.
   * Pulls last N summaries and injects them as "previous context".
   */
  async bootstrap() {
    if (this.bootstrapped) return { source: 'already-bootstrapped' };
    if (!ledger) {
      this.bootstrapped = true; // mark so we don't loop forever
      return { source: 'skipped', reason: 'no ledger' };
    }

    try {
      const entries = await ledger.ledgerRead(this.opts.ledgerTarget, {
        // FIX #30: ask for more than we need so the φ-summary filter still
        // returns bootstrapCount items after dropping unrelated messages.
        limit: Math.max(this.opts.bootstrapCount * 4, 20)
      });

      const all = (entries.messages || [])
        // FIX #30: Filter on a stable marker (type field) AND fall back to
        // the text prefix. The previous filter used a brittle substring
        // match anywhere in `text`.
        .filter(m => m && (
          m.type === 'φ-summary' ||
          (typeof m.text === 'string' && m.text.startsWith('φ-summary:'))
        ))
        // FIX #30: Sort by timestamp explicitly (don't trust API order),
        // then take the newest N.
        .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

      const summaries = all.slice(-this.opts.bootstrapCount);

      for (const s of summaries) {
        const text = typeof s.text === 'string' ? s.text : '';
        this.compressor.summaries.push({
          summary: text.replace(/^φ-summary:\s*/, ''),
          timestamp: s.timestamp,
          restoredFromLedger: true
        });
      }

      this.bootstrapped = true;
      return {
        source: 'ledger',
        restored: summaries.length,
        summaries: summaries.map(s => (typeof s.text === 'string' ? s.text.slice(0, 100) : ''))
      };
    } catch (e) {
      this.bootstrapped = true; // FIX #30: don't retry forever on hard error
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
      // FIX #31: throttle pushes to avoid hammering the ledger.
      const now = Date.now();
      if (now - this._lastPushAt < this.opts.minPushIntervalMs) {
        pushResult = {
          skipped: true,
          reason: 'rate-limited',
          nextEligibleInMs: this.opts.minPushIntervalMs - (now - this._lastPushAt),
        };
      } else {
        try {
          this._lastPushAt = now;
          pushResult = await ledger.ledgerAppend({
            type: 'φ-summary',                                   // FIX #30: stable filter key
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
