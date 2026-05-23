// lib/memory-compress.js — φ-8 Memory with Golden Ratio Compression
// Sliding window: 8 messages. Every 2nd query: 5-sentence φ-compressed summary.
// Load only when query matches memory/recall keywords.

const MAX_WINDOW = 8;
const SUMMARY_TRIGGER = 2;    // every 2 queries
const MAX_SUMMARY_SENTENCES = 5; // 5/8 ≈ 1/φ

class MemoryCompressor {
  constructor(sessionId = 'default') {
    this.sessionId = sessionId;
    this.messages = [];
    this.summaries = [];
    this.queryCount = 0;
    this.attachments = [];
  }

  /**
   * Add a message to the window
   */
  add(role, content, meta = {}) {
    this.messages.push({ role, content, timestamp: Date.now(), ...meta });
    if (this.messages.length > MAX_WINDOW) this.messages.shift();
  }

  /**
   * Record a user query and check if compression needed
   */
  bumpQuery() {
    this.queryCount++;
    return this.shouldCompress();
  }

  shouldCompress() {
    return this.queryCount % SUMMARY_TRIGGER === 0 && this.messages.length >= 2;
  }

  /**
   * Generate φ-compressed summary (stub — LLM call in production)
   * Returns the summary text + metadata
   */
  compress() {
    // In real use: call Groq/fast model to summarize.
    // Here: deterministic extraction of key sentences.
    const userMessages = this.messages
      .filter(m => m.role === 'user')
      .map(m => m.content);

    if (userMessages.length === 0) return null;

    // Extract key sentences: first, last, and middle
    const sentences = [];
    const first = userMessages[0];
    const last = userMessages[userMessages.length - 1];

    sentences.push(this._firstSentence(first));
    if (userMessages.length > 2) {
      const mid = userMessages[Math.floor(userMessages.length / 2)];
      sentences.push(this._firstSentence(mid));
    }
    sentences.push(this._firstSentence(last));

    const summary = sentences.filter(Boolean).join(' ');
    const entry = {
      summary,
      queryCount: this.queryCount,
      timestamp: Date.now(),
      messagesCompressed: this.messages.length
    };
    this.summaries.push(entry);
    return entry;
  }

  _firstSentence(text) {
    if (!text) return '';
    const m = text.match(/[^.!?]+[.!?]/);
    return m ? m[0].trim() : text.slice(0, 100);
  }

  /**
   * Get context for injection: summaries + recent window
   */
  getContext() {
    const recent = this.messages.map(m => `${m.role}: ${m.content.slice(0, 200)}`);
    const summary = this.summaries.length > 0
      ? `PREVIOUS CONTEXT:\n${this.summaries[this.summaries.length - 1].summary}\n`
      : '';
    return { summary, recent, count: this.messages.length };
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      queryCount: this.queryCount,
      windowSize: this.messages.length,
      summaryCount: this.summaries.length,
      lastSummary: this.summaries[this.summaries.length - 1] || null
    };
  }
}

module.exports = { MemoryCompressor, MAX_WINDOW, SUMMARY_TRIGGER, MAX_SUMMARY_SENTENCES };
