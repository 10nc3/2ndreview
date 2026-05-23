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

function recordStrike(provider, errorMsg) {
  provider = provider.toLowerCase();
  if (!_strikes[provider]) _strikes[provider] = { count: 0, lastFail: 0, demoted: false };

  const s = _strikes[provider];
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

function getStatus() {
  const out = {};
  for (const [p, s] of Object.entries(_strikes)) {
    if (s.count > 0 || s.demoted) out[p] = { ...s, recoversIn: s.demoted ? Math.max(0, STRIKE_COOLDOWN_MS - (Date.now() - s.lastFail)) : 0 };
  }
  for (const [p, st] of Object.entries(_stats)) {
    if (!out[p]) out[p] = {};
    out[p].stats = { calls: st.calls, rate: st.calls > 0 ? Math.round((st.successes / st.calls) * 100) : null, status: st.status };
  }
  return out;
}

module.exports = { recordStrike, recordSuccess, isDemoted, getStatus, STRIKE_THRESHOLD, STRIKE_COOLDOWN_MS };
