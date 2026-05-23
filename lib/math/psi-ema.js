// lib/math/psi-ema.js — Ψ-EMA: Three-Dimensional Number Series Compass
// Based on BlueDream's psi-EMA.js, simplified to pure math (no LLM calls, no web search).
// Substrate-agnostic: markets, climate, demographics, physics — any stock/flow system.

const { PHI, PHI_SQUARED, PHI_INVERSE, PHI_INV_SQUARED } = require('./constants');

const FIB_PERIODS = {
  FAST_R: 13, SLOW_R: 21,
  FAST_Z: 21, SLOW_Z: 34,
  FAST_THETA: 34, SLOW_THETA: 55
};

const ROLLING_WINDOW = 50;

// ─── EMA ───────────────────────────────────────────────────────────────────
function ema(prices, period) {
  if (!prices || prices.length < period) return [];
  const k = 2 / (period + 1);
  const result = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// ─── Median & MAD (robust statistics) ──────────────────────────────────────
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mad(arr) {
  const m = median(arr);
  const devs = arr.map(v => Math.abs(v - m));
  return median(devs) * 1.4826; // consistent estimator for normal
}

// ─── Ψ-EMA Core ────────────────────────────────────────────────────────────
/**
 * Compute Ψ-EMA dimensions for a price series.
 * @param {number[]} prices — closing prices, oldest first
 * @returns {Object|null} { theta, z, R, regime, latest }
 */
function computePsiEMA(prices) {
  const minLen = Math.max(ROLLING_WINDOW, FIB_PERIODS.SLOW_THETA) + 10;
  if (!prices || prices.length < minLen) return null;

  const emaFastR = ema(prices, FIB_PERIODS.FAST_R);
  const emaSlowR = ema(prices, FIB_PERIODS.SLOW_R);
  const emaFastZ = ema(prices, FIB_PERIODS.FAST_Z);
  const emaSlowZ = ema(prices, FIB_PERIODS.SLOW_Z);
  const emaFastTheta = ema(prices, FIB_PERIODS.FAST_THETA);
  const emaSlowTheta = ema(prices, FIB_PERIODS.SLOW_THETA);

  const idx = prices.length - 1;
  const price = prices[idx];

  // θ: phase angle
  const deltaTheta = emaFastTheta[idx] - emaSlowTheta[idx];
  const theta = Math.atan2(deltaTheta, price) * (180 / Math.PI);

  // z: anomaly score (MAD-based)
  const recent = prices.slice(-ROLLING_WINDOW);
  const med = median(recent);
  const mdev = mad(recent);
  const z = mdev > 0 ? (price - med) / mdev : 0;

  // R: convergence ratio
  const zPrev = mdev > 0 ? (prices[idx - 1] - median(prices.slice(-ROLLING_WINDOW - 1, -1))) / mdev : 0;
  const R = Math.abs(zPrev) > 0.001 ? z / zPrev : 1;

  // Regime classification
  let regime;
  if (Math.abs(R) > PHI_SQUARED) regime = 'ESCAPE';
  else if (Math.abs(R) > PHI) regime = Math.abs(R) > PHI_SQUARED ? 'ESCAPE' : 'OPTIMISM';
  else if (Math.abs(R) >= PHI_INVERSE) regime = 'BREATHING';
  else if (Math.abs(R) >= PHI_INV_SQUARED) regime = 'FATALISM_CLIFF';
  else regime = z > 0 ? 'BULLISH_REVERSAL' : 'FATALISM';

  return {
    theta: parseFloat(theta.toFixed(2)),
    z: parseFloat(z.toFixed(4)),
    R: parseFloat(R.toFixed(4)),
    regime,
    latest: price,
    phi: { PHI, PHI_SQUARED, PHI_INVERSE, PHI_INV_SQUARED }
  };
}

// ─── Regime Interpretation (measurement only, no prediction) ───────────────
function classifyRegime(R, z) {
  const absR = Math.abs(R);
  if (absR > PHI_SQUARED) return { regime: 'ESCAPE', note: 'amplitude exploding — unsustainable' };
  if (absR > PHI) return { regime: 'OPTIMISM', note: 'amplitude growing — watch convergence' };
  if (absR >= PHI_INVERSE) return { regime: 'BREATHING', note: 'golden rhythm — sustainable oscillation' };
  if (absR >= PHI_INV_SQUARED) return { regime: 'FATALISM_CLIFF', note: 'decaying — approaching critical' };
  if (z > 0) return { regime: 'BULLISH_REVERSAL', note: 'deep negative but positive momentum' };
  return { regime: 'FATALISM', note: 'captured — falling toward void' };
}

module.exports = {
  computePsiEMA,
  classifyRegime,
  PHI, PHI_SQUARED, PHI_INVERSE, PHI_INV_SQUARED,
  FIB_PERIODS, ROLLING_WINDOW, ema, median, mad
};
