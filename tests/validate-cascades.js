// tests/validate-cascades.js — Smoke tests for cascade modules

const { search, pdf, math, model, getStatus } = require('../lib/cascade-index');
const { MemoryCompressor } = require('../lib/memory-compress');
const { parsePdfCascade } = require('../lib/pdf-cascade');

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.error(`❌ ${label}`); }
}

console.log('=== Cascade Validation ===\n');

// ─── Status ────────────────────────────────────────────────────────────────
const st = getStatus();
assert('Status: search has tiers', st.search.tiers.length >= 2);
assert('Status: brave ready', st.search.tiers.some(t => t.name === 'brave' && t.ready));
assert('Status: pdf ready', st.pdf.ready);
assert('Status: model has 3 tiers', st.model.tiers.length === 3);
assert('Status: model all ready', st.model.tiers.every(t => t.ready));

// ─── Math Cascade ──────────────────────────────────────────────────────────
const m = math('700*1500/12000', {
  localType: 'seed-metric',
  localParams: { city: 'Test', year: 2026, landPricePerSqm: 1500, medianIncome: 12000 }
});
assert('Math: returns promise', m instanceof Promise);

m.then(res => {
  assert('Math: resolved', res.tier === 'local');
  assert('Math: deterministic', res.deterministic === true);
  assert('Math: has result', res.result && res.result.yearsToMortgage > 0);
});

// ─── PDF Cascade ───────────────────────────────────────────────────────────
// Need a real PDF to test; skip if none available
const testPdf = '/tmp/test-cascade.pdf';
const fs = require('fs');
const hasTestPdf = fs.existsSync(testPdf);

if (hasTestPdf) {
  parsePdfCascade(testPdf).then(res => {
    assert('PDF: resolved', !!res.tier);
    assert('PDF: has text or error', res.text !== undefined || res.error !== undefined);
  });
} else {
  console.log('⚠️  Skipping PDF test — no test file at /tmp/test-cascade.pdf');
}

// ─── Memory Compress (benchmark baseline) ──────────────────────────────────
const mc = new MemoryCompressor('test');
mc.add('user', 'What is the seed metric for Bangkok in 2025?');
mc.add('assistant', 'The seed metric for Bangkok is 87.5 years to afford 700m².');
mc.bumpQuery();
const ctx = mc.getContext();
assert('MemoryCompress: has context', ctx.recent.length > 0);

// ─── Summary ───────────────────────────────────────────────────────────────
setTimeout(() => {
  const total = pass + fail;
  console.log(`\n=== Results ===`);
  console.log(`Pass: ${pass}/${total} | Fail: ${fail}/${total}`);
  console.log(fail === 0 ? '\n🐱 CASCADES VALID — nyan~ 🔥' : `\n⚠️ ${fail} test(s) failed`);
  process.exit(fail > 0 ? 1 : 0);
}, 1000);
