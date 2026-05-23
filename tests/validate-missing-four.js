// tests/validate-missing-four.js — Tests for the 4 items from my prior analysis

const { MemoryCompressor, MAX_WINDOW, SUMMARY_TRIGGER } = require('../lib/memory-compress');
const { stripPII, isClean, audit } = require('../lib/pii-guard');
const { routeTemperature, formatTempDirective, ROUTES } = require('../lib/temperature-router');
const { recordStrike, recordSuccess, isDemoted, getStatus } = require('../lib/strike-chain');

let pass = 0;
let fail = 0;
function assert(label, condition) { if (condition) { pass++; console.log(`✅ ${label}`); } else { fail++; console.error(`❌ ${label}`); } }

console.log('=== Missing 4 Items Validation ===\n');

// ─── 1. Memory Compressor ──────────────────────────────────────────────────
const mem = new MemoryCompressor('sess-1');
mem.add('user', 'What is the weather in Bangkok?');
mem.add('assistant', 'It is 32°C and sunny.');
assert('Mem: window has 2', mem.messages.length === 2);
mem.bumpQuery(); // queryCount=1, not triggered
assert('Mem: shouldCompress at query 2', mem.bumpQuery() === true); // queryCount=2, triggers
const summary = mem.compress();
assert('Mem: summary generated', summary !== null && summary.summary.length > 0);
assert('Mem: φ-8 constant', MAX_WINDOW === 8);
assert('Mem: trigger at 2', SUMMARY_TRIGGER === 2);
assert('Mem: 5/8 ratio', summary.messagesCompressed <= 8);

// Fill window to 9 (should evict oldest)
for (let i = 0; i < 7; i++) mem.add('user', `msg ${i}`);
assert('Mem: window capped at 8', mem.messages.length === 8);

// ─── 2. PII Guard ──────────────────────────────────────────────────────────
assert('PII: strip email', stripPII('Email me at foo@bar.com please').includes('[email]'));
assert('PII: strip phone', stripPII('Call +1-555-123-4567').includes('[phone]'));
assert('PII: clean text passes', isClean('hello world'));
assert('PII: dirty text fails', !isClean('reach me at foo@bar.com'));
const auditResult = audit('Contact: john@doe.com or +1-555-123-4567');
assert('PII: audit finds 2', auditResult.findings.length >= 2);

// ─── 3. Temperature Router ─────────────────────────────────────────────────
assert('Temp: deterministic = 0', routeTemperature('deterministic').temp === 0);
assert('Temp: creative = 0.7', routeTemperature('creative').temp === 0.7);
const auto = routeTemperature(null, 'summarize this long text');
assert('Temp: auto-detect summary', auto.key === 'summarization');
const auto2 = routeTemperature(null, 'tell me a creative story');
assert('Temp: auto-detect creative', auto2.key === 'creative');
assert('Temp: format includes desc', formatTempDirective('audit').includes('Temperature:'));

// ─── 4. Strike Chain ───────────────────────────────────────────────────────
recordSuccess('openrouter');
assert('Strike: healthy', !isDemoted('openrouter'));
recordStrike('openrouter', 'timeout');
recordStrike('openrouter', 'timeout');
recordStrike('openrouter', 'timeout');
assert('Strike: demoted after 3', isDemoted('openrouter'));
recordSuccess('openrouter');
assert('Strike: reset on success', !isDemoted('openrouter'));
recordStrike('broken', 'fail');
recordStrike('broken', 'fail');
recordStrike('broken', 'fail');
assert('Strike: broken demoted', isDemoted('broken'));
const status = getStatus();
assert('Strike: status object', typeof status === 'object');
console.log('Strike status:', JSON.stringify(status, null, 2));

// ─── Summary ───────────────────────────────────────────────────────────────
console.log('\n=== Results ===');
console.log(`Pass: ${pass} | Fail: ${fail}`);
console.log(fail === 0 ? '\n🐱 ALL 4 ITEMS VALID — BUILD COMPLETE — nyan~ 🔥' : `\n⚠️ ${fail} test(s) failed`);
process.exit(fail > 0 ? 1 : 0);
