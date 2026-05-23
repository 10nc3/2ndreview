// tests/validate-build-v2.js — Smoke test for BUILD-v2 architecture

const { route, getExpertFiles, getRouterStats } = require('../lib/context-router');
const { PipelineState, PIPELINE_STEPS, MODES } = require('../lib/pipeline-state');
const { CONFIG, calculateBreaths, getBreathType } = require('../lib/phi-breathe');
const { DataPackage, createPackage, listPackages } = require('../utils/data-package');

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.error(`❌ ${label}`); }
}

console.log('=== BUILD v2 Validation ===\n');

// --- Context Router ---
const coreOnly = route('hello how are you');
assert('Router: generic query => core only', coreOnly.length === 1 && coreOnly[0] === 'core');

const philQuery = route('explain the φ dimension');
assert('Router: φ query => philosophy', philQuery.includes('philosophy'));

const memQuery = route('remember what we discussed yesterday');
assert('Router: memory query => memory', memQuery.includes('memory'));

const toolQuery = route('check stock price for');
assert('Router: tool query => tools', toolQuery.includes('tools'));

const files = getExpertFiles(['core', 'philosophy']);
assert('Router: returns correct files', files.includes('reference/PHILOSOPHY.md'));

assert('Router stats populated', getRouterStats().length > 0);

// --- Pipeline State ---
const pipe = new PipelineState('test query', 'test-caller');
assert('Pipeline: created with query', pipe.query === 'test query');
assert('Pipeline: starts at S-1', pipe.step === PIPELINE_STEPS.CONTEXT_EXTRACT);

pipe.setMode(MODES.PLAN);
assert('Pipeline: mode settable', pipe.mode === 'plan');

pipe.setContext(['core', 'tools'], ['USER.md', 'TOOLS.md'], 1500);
assert('Pipeline: context stored', pipe.context.experts.length === 2);

pipe.setAudit(true, ['no-hallucination', 'data-backed']);
assert('Pipeline: audit pass', pipe.audit.passed === true);

pipe.complete();
const json = pipe.toJSON();
assert('Pipeline: JSON export', json.mode === 'plan' && json.durationMs !== null);
assert('Pipeline: markdown export', pipe.toMarkdown().includes('test query'));

// --- Phi Breathe ---
assert('Phi: CONFIG.BASE_MS > 0', CONFIG.BASE_MS === 8600);
assert('Phi: PHI ≈ 1.618', Math.abs(CONFIG.PHI - 1.618) < 0.001);
const breaths = calculateBreaths(100000);
assert('Phi: breaths calculable', breaths > 0);
const btype = getBreathType(17);
assert('Phi: breath type returns string', typeof btype === 'string');

// --- Data Package ---
const pkg = createPackage('test-session');
assert('DataPackage: created with ID', pkg.id.startsWith('pkg_'));

pkg.writeStage('S2', { tokensIn: 100, tokensOut: 50, provider: 'openrouter' });
assert('DataPackage: stage written', pkg.readStage('S2').tokensIn === 100);

pkg.complete('done');
assert('DataPackage: completed', pkg.status === 'done');

const pkgs = listPackages(10);
assert('DataPackage: listed', pkgs.length >= 1);

// --- Summary ---
console.log('\n=== Results ===');
console.log(`Pass: ${pass} | Fail: ${fail}`);
console.log(fail === 0 ? '\n🐱 BUILD v2 VALID — nyan~ 🔥' : `\n⚠️ ${fail} test(s) failed`);
process.exit(fail > 0 ? 1 : 0);
