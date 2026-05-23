// tests/validate-math-satellites.js — Smoke tests for math modules

const { computePsiEMA, classifyRegime, PHI } = require('../lib/math/psi-ema');
const { measureAffordability, compareTimePeriods, solveIdentity, regimeEmoji, LAND_QUANTA } = require('../lib/math/seed-metric');

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.error(`❌ ${label}`); }
}

console.log('=== Math Satellites Validation ===\n');

// ─── Seed Metric ───────────────────────────────────────────────────────────
const bangkok = measureAffordability({
  city: 'Bangkok',
  year: 2026,
  landPricePerSqm: 1500,
  medianIncome: 12000
});
assert('Seed: Bangkok calculated', bangkok.yearsToMortgage > 0);
assert('Seed: totalPrice = 1500*700', bangkok.totalPrice === 1500 * LAND_QUANTA);

const expensive = measureAffordability({
  city: 'Tokyo',
  year: 2026,
  landPricePerSqm: 15000,
  medianIncome: 8000
});
assert('Seed: Tokyo >25yr = FATALISM', expensive.regime === 'FATALISM');

const cheap = measureAffordability({
  city: 'Bali',
  year: 2026,
  landPricePerSqm: 100,
  medianIncome: 10000
});
assert('Seed: cheap = OPTIMISM', cheap.regime === 'OPTIMISM');

const compare = compareTimePeriods(bangkok, expensive);
assert('Seed: comparison works', compare.direction === 'WORSENING');

assert('Seed: solveIdentity(0) ≈ φ', Math.abs(solveIdentity(0) - PHI) < 0.01);
assert('Seed: emoji returns string', typeof regimeEmoji(15) === 'string');

// ─── Ψ-EMA ─────────────────────────────────────────────────────────────────
const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 10) * 10 + i * 0.05);
const psi = computePsiEMA(prices);
assert('Psi: computed with 100 prices', psi !== null);
assert('Psi: has theta', typeof psi.theta === 'number');
assert('Psi: has z', typeof psi.z === 'number');
assert('Psi: has R', typeof psi.R === 'number');
assert('Psi: regime string', typeof psi.regime === 'string');

const cls = classifyRegime(psi.R, psi.z);
assert('Psi: classify returns regime', cls.regime.length > 0);

const tooShort = computePsiEMA([1, 2, 3]);
assert('Psi: short array returns null', tooShort === null);

// ─── Integrity ─────────────────────────────────────────────────────────────
assert('PHI constant matches', Math.abs(PHI - 1.618) < 0.001);
assert('LAND_QUANTA = 700', LAND_QUANTA === 700);

// ─── Summary ───────────────────────────────────────────────────────────────
console.log('\n=== Results ===');
console.log(`Pass: ${pass} | Fail: ${fail}`);
console.log(fail === 0 ? '\n🐱 MATH SATELLITES VALID — nyan~ 🔥' : `\n⚠️ ${fail} test(s) failed`);
process.exit(fail > 0 ? 1 : 0);
