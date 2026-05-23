// tests/validate-full-suite.js — Full smoke test for ALL v2 modules

const { route, getExpertFiles } = require('../lib/context-router');
const { PipelineState, PIPELINE_STEPS, MODES } = require('../lib/pipeline-state');
const { CONFIG, calculateBreaths } = require('../lib/phi-breathe');
const { DataPackage, createPackage, listPackages } = require('../utils/data-package');
const { computePsiEMA, classifyRegime, PHI } = require('../lib/math/psi-ema');
const { measureAffordability, solveIdentity, LAND_QUANTA } = require('../lib/math/seed-metric');
const { getStatus: getSyncStatus } = require('../lib/sync/workspace-sync');

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.error(`❌ ${label}`); }
}

console.log('=== BUILD v2 Full Suite Validation ===\n');

// ─── Context Router ────────────────────────────────────────────────────────
assert('Router: core always', route('hello').includes('core'));
assert('Router: φ → philosophy', route('phi dimension').includes('philosophy'));
assert('Router: memory triggers', route('remember yesterday').includes('memory'));
assert('Router: tools triggers', route('stock price').includes('tools'));
assert('Router: files correct', getExpertFiles(['core']).length >= 3);

// ─── Pipeline State ────────────────────────────────────────────────────────
const p = new PipelineState('test', 'caller');
assert('Pipeline: init', p.step === 'S-1');
p.setMode(MODES.BUILD);
assert('Pipeline: mode build', p.mode === 'build');
p.setAudit(true, ['check']);
assert('Pipeline: audit pass', p.audit.passed === true);
p.complete();
assert('Pipeline: completed', p.completedAt !== null);

// ─── Phi Breathe ───────────────────────────────────────────────────────────
assert('Phi: base ms', CONFIG.BASE_MS === 8600);
assert('Phi: breaths calc', calculateBreaths(100000) > 0);

// ─── Data Package ──────────────────────────────────────────────────────────
const pkg = createPackage('sess');
assert('Package: created', pkg.id.startsWith('pkg_'));
pkg.writeStage('S2', { tokensIn: 50 });
assert('Package: stage read', pkg.readStage('S2').tokensIn === 50);
pkg.complete();
assert('Package: done', pkg.status === 'done');

// ─── ψ-EMA ─────────────────────────────────────────────────────────────────
const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.02);
const psi = computePsiEMA(prices);
assert('Psi: computed', psi !== null);
assert('Psi: theta number', typeof psi.theta === 'number');
assert('Psi: regime string', typeof psi.regime === 'string' && psi.regime.length > 0);
const cls = classifyRegime(1.5, 0.5);
assert('Psi: classify breathing', cls.regime === 'BREATHING');
assert('Psi: null on short', computePsiEMA([1, 2]) === null);

// ─── Seed Metric ───────────────────────────────────────────────────────────
const sm = measureAffordability({ city: 'Test', year: 2026, landPricePerSqm: 1000, medianIncome: 10000 });
assert('Seed: years calc', sm.yearsToMortgage === (1000 * 700) / 10000);
assert('Seed: regime', ['OPTIMISM', 'PHI-BREATHING', 'FATALISM'].includes(sm.regime));
assert('Seed: identity ≈ φ', Math.abs(solveIdentity(0) - PHI) < 0.01);
assert('Seed: quanta', LAND_QUANTA === 700);

// ─── Workspace Sync ────────────────────────────────────────────────────────
const nb = getSyncStatus();
assert('Sync: status object', typeof nb === 'object');
assert('Sync: webhook enabled boolean', typeof nb.webhook.enabled === 'boolean');

// ─── Summary ───────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== Results ===`);
console.log(`Pass: ${pass}/${total} | Fail: ${fail}/${total}`);
console.log(fail === 0
  ? `\n🐱 ALL SYSTEMS VALID — BUILD v2 COMPLETE — nyan~ 🔥`
  : `\n⚠️ ${fail} test(s) failed`);
process.exit(fail > 0 ? 1 : 0);
