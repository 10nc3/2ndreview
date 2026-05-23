/**
 * lib/pdf-cascade.js — Tiered PDF parsing with graceful degradation
 *
 * Tiers:
 *   1. pdftotext (poppler) — best formatting, native
 *   2. nano-pdf skill — JS-based, already enabled
 *   3. Raw text heuristic — last resort
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// FIX #19: Don't hardcode a Homebrew path — resolve `pdftotext` from $PATH
// (or PDFTOTEXT_BIN env var). The previous default failed on every
// non-Homebrew machine (Linux, Replit, vanilla macOS).
const PDFTOTEXT_BIN = process.env.PDFTOTEXT_BIN || 'pdftotext';

// FIX #19/#20: Probe binary once at module load so cascade-index can report
// real readiness instead of hardcoded `true`.
function _hasBin(bin) {
  try {
    if (bin.includes('/')) return fsSync.existsSync(bin);
    const PATH = (process.env.PATH || '').split(path.delimiter);
    return PATH.some(p => {
      try { return p && fsSync.existsSync(path.join(p, bin)); }
      catch { return false; }
    });
  } catch {
    return false;
  }
}
const HAS_PDFTOTEXT = _hasBin(PDFTOTEXT_BIN);

async function parseWithPdftotext(filePath, opts = {}) {
  const { layout = true, pages = null } = opts;
  const args = [
    layout ? '-layout' : '-raw',
    ...(pages ? ['-f', String(pages[0]), '-l', String(pages[1])] : []),
    filePath,
    '-'
  ];
  const { stdout, stderr } = await execFileAsync(PDFTOTEXT_BIN, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000
  });
  if (stderr) console.warn('[pdf-cascade] pdftotext stderr:', stderr);
  return stdout;
}

async function parseWithNanoPdf(filePath) {
  // Fallback: if nano-pdf skill exposes a JS API
  try {
    const nano = require('/opt/homebrew/lib/node_modules/openclaw/skills/nano-pdf');
    return await nano.extractText(filePath);
  } catch {
    // FIX #18 (CRITICAL): Previously `filePath` was interpolated directly
    // into a Python source string passed via `python3 -c`. A filename like
    //   ' + __import__('os').system('rm -rf ~') + '
    // would execute arbitrary code. Pass the path as an argv parameter and
    // read it inside Python via sys.argv[1] — no string concatenation.
    const pyScript = [
      "import sys",
      "sys.path.insert(0, '/opt/homebrew/lib/node_modules/openclaw/skills/nano-pdf')",
      "from nano_pdf import extract_text",
      "print(extract_text(sys.argv[1]))",
    ].join('; ');
    const { stdout } = await execFileAsync(
      'python3',
      ['-c', pyScript, filePath],
      { timeout: 30000 }
    ).catch(() => ({ stdout: '' }));
    return stdout;
  }
}

async function parseHeuristic(buffer) {
  // Last resort: extract raw text from PDF binary
  const text = buffer.toString('utf8');
  // Find text between stream/endstream, rough filter
  const streams = text.match(/stream\r?\n([\s\S]*?)\r?\nendstream/g) || [];
  const extracted = streams
    .map(s => s.replace(/^stream\r?\n/, '').replace(/\r?\nendstream$/, ''))
    .join('\n')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  return extracted.slice(0, 50000); // safety cap
}

// FIX #26: Track temp files in a module-level set and register a single
// process-exit cleanup so a mid-extract crash doesn't leak /tmp files.
const _tempFiles = new Set();
let _exitHookInstalled = false;
function _installExitHook() {
  if (_exitHookInstalled) return;
  _exitHookInstalled = true;
  const cleanup = () => {
    for (const f of _tempFiles) {
      try { fsSync.unlinkSync(f); } catch { /* ignore */ }
    }
    _tempFiles.clear();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
}

/**
 * Parse PDF with cascade
 * @param {string|Buffer} input — file path or buffer
 * @returns {Object} { text, tier, lossy, error }
 */
async function parsePdfCascade(input) {
  let filePath = null;
  let buffer = null;
  let isTempFile = false;

  if (Buffer.isBuffer(input)) {
    // FIX #26: place temp files in os.tmpdir() (not bare /tmp) and use a
    // collision-resistant name. Track for cleanup on exit.
    buffer = input;
    filePath = path.join(
      os.tmpdir(),
      `pdf-cascade-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
    );
    await fs.writeFile(filePath, buffer);
    isTempFile = true;
    _tempFiles.add(filePath);
    _installExitHook();
  } else {
    filePath = path.resolve(input);
    // FIX #27: Don't pre-read the file when the caller gave us a path —
    // tier 1 (pdftotext) only needs the path. We'll lazy-load the buffer
    // only if we reach the heuristic tier.
    buffer = null;
  }

  try {
    // Tier 1: pdftotext
    if (HAS_PDFTOTEXT) {
      try {
        const text = await parseWithPdftotext(filePath);
        if (text.trim().length > 50) {
          return { text, tier: 'pdftotext', lossy: false, error: null };
        }
      } catch {
        // fall through
      }
    }

    // Tier 2: nano-pdf
    try {
      const text = await parseWithNanoPdf(filePath);
      if (text && text.trim().length > 50) {
        return { text, tier: 'nano-pdf', lossy: true, error: null };
      }
    } catch {
      // fall through
    }

    // Tier 3: heuristic (now we actually need the bytes)
    if (!buffer) buffer = await fs.readFile(filePath);    // FIX #27
    const text = await parseHeuristic(buffer);
    return { text, tier: 'heuristic', lossy: true, error: null };
  } catch (e) {
    return { text: '', tier: null, lossy: true, error: e.message };
  } finally {
    if (isTempFile && filePath) {
      _tempFiles.delete(filePath);
      fs.unlink(filePath).catch(() => {});
    }
  }
}

function getStatus() {
  return {
    tiers: ['pdftotext', 'nano-pdf', 'heuristic'],
    pdftotext: { bin: PDFTOTEXT_BIN, available: HAS_PDFTOTEXT },  // FIX #20
    ready: true, // heuristic tier is always available
  };
}

module.exports = { parsePdfCascade, parseWithPdftotext, getStatus, HAS_PDFTOTEXT };
