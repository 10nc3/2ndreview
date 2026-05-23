/**
 * lib/pdf-cascade.js — Tiered PDF parsing with graceful degradation
 *
 * Tiers:
 *   1. pdftotext (poppler) — best formatting, native
 *   2. nano-pdf skill — JS-based, already enabled
 *   3. Raw text heuristic — last resort
 */

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PDFTOTEXT_BIN = '/opt/homebrew/bin/pdftotext';

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
    // nano-pdf may not expose clean JS API; use shell
    const { stdout } = await execFileAsync('python3', [
      '-c',
      `import sys; sys.path.insert(0, '/opt/homebrew/lib/node_modules/openclaw/skills/nano-pdf'); from nano_pdf import extract_text; print(extract_text('${filePath}'))`
    ], { timeout: 30000 }).catch(() => ({ stdout: '' }));
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

/**
 * Parse PDF with cascade
 * @param {string|Buffer} input — file path or buffer
 * @returns {Object} { text, tier, lossy, error }
 */
async function parsePdfCascade(input) {
  let filePath = null;
  let buffer = null;

  if (Buffer.isBuffer(input)) {
    buffer = input;
    filePath = `/tmp/pdf-cascade-${Date.now()}.pdf`;
    await fs.writeFile(filePath, buffer);
  } else {
    filePath = path.resolve(input);
    buffer = await fs.readFile(filePath);
  }

  // Tier 1: pdftotext
  try {
    const text = await parseWithPdftotext(filePath);
    if (text.trim().length > 50) {
      return { text, tier: 'pdftotext', lossy: false, error: null };
    }
  } catch (e) {
    // fall through
  }

  // Tier 2: nano-pdf
  try {
    const text = await parseWithNanoPdf(filePath);
    if (text.trim().length > 50) {
      return { text, tier: 'nano-pdf', lossy: true, error: null };
    }
  } catch {
    // fall through
  }

  // Tier 3: heuristic
  try {
    const text = await parseHeuristic(buffer);
    return { text, tier: 'heuristic', lossy: true, error: null };
  } catch (e) {
    return { text: '', tier: null, lossy: true, error: e.message };
  } finally {
    if (Buffer.isBuffer(input) && filePath) {
      fs.unlink(filePath).catch(() => {});
    }
  }
}

module.exports = { parsePdfCascade, parseWithPdftotext };
