// lib/log.js — Tiny levelled logger so callers stop calling console.* directly.
// FIX #16: Single import surface for log output. Levels can be silenced
// (LOG_LEVEL=silent) or filtered (LOG_LEVEL=warn). Tests can swap the
// underlying writer via setWriter() without monkey-patching console.

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
let _level = LEVELS[envLevel] != null ? LEVELS[envLevel] : LEVELS.info;
let _writer = (lvl, args) => {
  const ts = new Date().toISOString();
  const tag = `[${ts}] [${lvl.toUpperCase()}]`;
  if (lvl === 'error' || lvl === 'warn') console.error(tag, ...args);
  else console.log(tag, ...args);
};

function setLevel(name) {
  const n = LEVELS[String(name).toLowerCase()];
  if (n != null) _level = n;
}

function setWriter(fn) { if (typeof fn === 'function') _writer = fn; }

function _log(lvl, args) {
  if (_level >= LEVELS[lvl]) _writer(lvl, args);
}

module.exports = {
  error: (...a) => _log('error', a),
  warn:  (...a) => _log('warn',  a),
  info:  (...a) => _log('info',  a),
  debug: (...a) => _log('debug', a),
  setLevel,
  setWriter,
  LEVELS,
};
