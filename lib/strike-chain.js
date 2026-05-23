// lib/strike-chain.js — Self-Healing Provider Strike System
// 3 consecutive failures → demote provider. 5-min cooldown → auto-recover.
// From BlueDream/Probably Nothing. Production-grade resilience.

const STRIKE_THRESHOLD = 3;
const STRIKE_COOLDOWN_MS = 5 * 60 * 1000;

const _strikes = {};
const _stats = {};

function _ensureStats(provider) {
  if (!_stats[provider]) {
    _stats[provider] = {
      calls: 0, successes: 0, failures: 0,
      lastSuccess: null, lastFailure: null, status: 'unknown'
    };
  }
  return _stats[provider];
}

function _ensureStrike(provider) {
  if (!_strikes[provider]) {
    _strikes[provider] = { count: 0, lastFail: 0, demoted: false };
  }
  return _strikes[provider];
}

function recordStrike(provider, errorMsg) {
  provider = provider.toLowerCase();
  const s = _ensureStrike(provider);
  s.count++;
  s.lastFail = Date.now();

  if (s.count >= STRIKE_THRESHOLD && !s.demoted) {
    s.demoted = true;
    console.warn(`[strike] ${provider} demoted after ${s.count} failures`);
  }

  const st = _ensureStats(provider);
  st.calls++;
  st.failures++;
  st.lastFailure = Date.now();
  st.status = s.demoted ? 'demoted' : 'degraded';
}

function recordSuccess(provider) {
  provider = provider.toLowerCase();
  if (_strikes[provider]) {
    _strikes[provider] = { count: 0, lastFail: 0, demoted: false };
  }
  const st = _ensureStats(provider);
  st.calls++;
  st.successes++;
  st.lastSuccess = Date.now();
  st.status = 'healthy';
}

function isDemoted(provider) {
  const s = _strikes[provider.toLowerCase()];
  if (!s || !s.demoted) return false;
  if (Date.now() - s.lastFail > STRIKE_COOLDOWN_MS) {
    s.count = 0; s.demoted = false;
    _ensureStats(provider).status = 'recovered';
    console.log(`[strike] ${provider} recovered after cooldown`);
    return false;
  }
  return true;
}

// FIX #10: Normalize getStatus() so every entry has the same shape regardless
// of whether the provider has only struck, only succeeded, or both.
// Previously: stats-only providers got `{ stats: {...} }` with no count/
// lastFail/demoted/recoversIn keys, which broke downstream consumers that
// assumed a uniform record.
function getStatus() {
  const out = {};
  const providers = new Set([...Object.keys(_strikes), ...Object.keys(_stats)]);

  for (const p of providers) {
    const s = _strikes[p] || { count: 0, lastFail: 0, demoted: false };
    const st = _stats[p] || { calls: 0, successes: 0, status: 'unknown' };

    out[p] = {
      count: s.count,
      lastFail: s.lastFail,
      demoted: s.demoted,
      recoversIn: s.demoted ? Math.max(0, STRIKE_COOLDOWN_MS - (Date.now() - s.lastFail)) : 0,
      stats: {
        calls: st.calls,
        successes: st.successes,
        failures: st.failures || 0,
        rate: st.calls > 0 ? Math.round((st.successes / st.calls) * 100) : null,
        status: st.status,
      },
    };
  }
  return out;
}

module.exports = { recordStrike, recordSuccess, isDemoted, getStatus, STRIKE_THRESHOLD, STRIKE_COOLDOWN_MS };
