// lib/math/seed-metric.js — Seed Metric: Single-Earner Affordability Calculator
// Deterministic math. No LLM. No search. Pure φ.
//
// Formula: Years = (LCU/sqm × 700) ÷ Single-Earner Income
// Thresholds: <10yr 🟢 | 10-25yr 🟡 | >25yr 🔴

const { PHI } = require('./constants');
const LAND_QUANTA = 700; // m² — the fertility unit

/**
 * Solve A = 1 + 1/A + sigma (identity equation)
 * @param {number} sigma — substrate stress
 * @returns {number} attractor value
 */
function solveIdentity(sigma = 0) {
  const a = 1;
  const b = -(1 + sigma);
  const c = -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return PHI;
  const A_pos = (-b + Math.sqrt(disc)) / (2 * a);
  const A_neg = (-b - Math.sqrt(disc)) / (2 * a);
  return A_pos > 0 ? A_pos : A_neg;
}

/**
 * Seed Metric core calculation
 * @param {Object} params
 * @param {string} params.city
 * @param {number} params.year
 * @param {number} params.landPricePerSqm — in local currency
 * @param {number} params.medianIncome — single-earner, annual, same currency
 * @returns {Object} full analysis
 */
function measureAffordability({ city, year, landPricePerSqm, medianIncome }) {
  const totalPrice = landPricePerSqm * LAND_QUANTA;
  const yearsToMortgage = totalPrice / medianIncome;

  let regime, sigma;
  if (yearsToMortgage > 25) {
    regime = 'FATALISM';
    sigma = (yearsToMortgage - 25) / 25;
  } else if (yearsToMortgage < 10) {
    regime = 'OPTIMISM';
    sigma = -(10 - yearsToMortgage) / 10;
  } else {
    regime = 'PHI-BREATHING';
    sigma = 0;
  }

  const A = solveIdentity(sigma);

  return {
    city,
    year,
    landPricePerSqm,
    medianIncome,
    totalPrice: Math.round(totalPrice),
    yearsToMortgage: parseFloat(yearsToMortgage.toFixed(1)),
    regime,
    sigma: parseFloat(sigma.toFixed(4)),
    identityValue: parseFloat(A.toFixed(4)),
    phiDeviation: parseFloat(Math.abs(A - PHI).toFixed(4)),
    metadata: {
      landQuanta: LAND_QUANTA,
      threshold: { fatalism: 25, breathing: 10 },
      fertilityWindow: 25,
      phi: PHI
    }
  };
}

/**
 * Compare two time periods or cities
 * @param {Object} m1 first measurement
 * @param {Object} m2 second measurement
 * @returns {Object} comparison
 */
function compareTimePeriods(m1, m2) {
  const deltaYears = m2.yearsToMortgage - m1.yearsToMortgage;
  const regimeChange = m1.regime !== m2.regime;
  return {
    city: m1.city === m2.city ? m1.city : `${m1.city} vs ${m2.city}`,
    period: `${m1.year} -> ${m2.year}`,
    deltaYears: parseFloat(deltaYears.toFixed(1)),
    regimeChange: regimeChange ? `${m1.regime} -> ${m2.regime}` : 'stable',
    direction: deltaYears > 0 ? 'WORSENING' : 'IMPROVING',
    measurements: [m1, m2]
  };
}

/**
 * Quick regime lookup without full calculation
 * @param {number} years years to afford 700m²
 * @returns {string} regime emoji
 */
function regimeEmoji(years) {
  if (years < 10) return '🟢 OPTIMISM';
  if (years < 25) return '🟡 BREATHING';
  return '🔴 FATALISM';
}

module.exports = {
  measureAffordability,
  compareTimePeriods,
  solveIdentity,
  regimeEmoji,
  PHI,
  LAND_QUANTA
};
