/**
 * spore-bootstrap.js — Recreate agent identity from Nyanbook.
 *
 * Usage:
 *   node lib/spore-bootstrap.js            # DRY RUN (default)
 *   node lib/spore-bootstrap.js --apply    # atomically swap files in
 *
 * Spore Protocol: Nyanbook primary -> local cache -> template defaults.
 *
 * Every review change is tagged // FIX2 #N so Kimi can grep:
 *   rg -n 'FIX2 #' lib/spore-bootstrap.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { BOOK_1, BOOK_2, auth, health } = require('./nyanbook/config');
const log = require('./log'); // FIX2 #6: use lib/log.js (added in FIX #16) instead of console.* with emoji

const IDENTITY_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md'];
const WORKSPACE = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(WORKSPACE, '.spore-staging');
const FETCH_TIMEOUT_MS = Number(process.env.SPORE_FETCH_TIMEOUT_MS || 15000);
const APPLY = process.argv.includes('--apply');

// FIX2 #1: timeout on every fetch (matches FIX #7 across the rest of the harness).
// Bootstrap must never hang the supervisor when Nyanbook is slow or unreachable.
async function fetchBookMessages(book, limit = 10) {
  const url = new URL(book.endpoint);
  url.searchParams.set('limit', String(limit));
  try {
    const res = await fetch(url.toString(), {
      headers: auth(book.token),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ': ' + body.slice(0, 200) : ''}`);
    }
    const data = await res.json();
    // FIX2 #4a: the documented webhook contract (.env.nyanbook header comments
    // before they were removed in bd65328) describes the POST payload only.
    // We do not know whether GET ?limit=N is supported. If the response shape
    // is unexpected, refuse to proceed instead of silently treating the lack
    // of messages as "checkpoint not yet written".
    if (!data || typeof data !== 'object') {
      throw new Error('unexpected response shape (not an object)');
    }
    return data;
  } catch (err) {
    log.error(`fetch failed for ${book.name}: ${err.message}`);
    return null;
  }
}

// FIX2 #4b: tighter checkpoint parser. The previous regex used a lookahead
// that fell off the LAST file in the message (no trailing header to anchor
// against) and silently extracted zero. This scans for fenced sections of
// the form ```file: SOUL.md\n...\n``` first, and only falls back to a
// header-split walk when no fences exist. The header walk anchors on
// indices so the last section runs to end-of-text correctly.
function parseCheckpoint(text) {
  if (typeof text !== 'string' || !text.length) return {};
  const files = {};

  const fenceRe = /```\s*file:\s*([A-Za-z0-9_.\-/]+)\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    const name = path.basename(m[1]);
    if (IDENTITY_FILES.includes(name)) files[name] = m[2].trimEnd() + '\n';
  }
  if (Object.keys(files).length) return files;

  const namesAlt = IDENTITY_FILES.map((n) => n.replace(/\./g, '\\.')).join('|');
  const headerRe = new RegExp(`(?:^|\\n)#{1,3}\\s*(${namesAlt})\\s*\\n`, 'gi');
  const positions = [];
  while ((m = headerRe.exec(text)) !== null) {
    positions.push({ name: path.basename(m[1]), start: m.index + m[0].length });
  }
  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
    files[positions[i].name] = text.slice(positions[i].start, end).trimEnd() + '\n';
  }
  return files;
}

// FIX2 #2: sort by timestamp DESC and pick the newest checkpoint.
// Webhook ordering is not contractually newest-first; the old `messages[0]`
// was a coin-flip between newest and oldest — and oldest = catastrophic
// regression to a day-zero identity snapshot.
function pickLatestCheckpoint(messages) {
  if (!Array.isArray(messages)) return null;
  const candidates = messages.filter(
    (m) =>
      typeof m?.text === 'string' &&
      (m.text.includes('Checkpoint #') || m.text.includes('Build:') || m.text.includes('SOUL.md'))
  );
  if (!candidates.length) return null;
  const ts = (m) => {
    const t = m.timestamp ?? m.created_at ?? m.ts ?? null;
    if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
    if (typeof t === 'string') return Date.parse(t) || 0;
    return 0;
  };
  candidates.sort((a, b) => ts(b) - ts(a));
  return candidates[0];
}

async function bootstrap() {
  log.info(`spore-bootstrap starting; mode = ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const h = health();
  log.info(`Book 1: ${h.book1?.ready ? 'ready' : 'down'} (${h.book1?.name ?? 'unknown'})`);
  log.info(`Book 2: ${h.book2?.ready ? 'ready' : 'down'} (${h.book2?.name ?? 'unknown'})`);

  let book1Data = null;
  let book2Data = null;
  if (h.book1?.ready) {
    log.info('fetching Book 1 (primary)');
    book1Data = await fetchBookMessages(BOOK_1, 25);
  }
  if (h.book2?.ready) {
    log.info('fetching Book 2 (operational)');
    book2Data = await fetchBookMessages(BOOK_2, 5);
  }

  // FIX2 #7a: source = "nyanbook" ONLY when we actually parsed a checkpoint.
  // A reachable Book 1 with zero parseable messages is a fallback case,
  // not a success — the old code declared success on reachability alone.
  const latest = pickLatestCheckpoint(book1Data?.messages);
  const extracted = latest ? parseCheckpoint(latest.text) : {};
  const fileCount = Object.keys(extracted).length;
  const source = fileCount > 0 ? 'nyanbook' : 'local';

  if (source === 'nyanbook') {
    log.info(`latest checkpoint: ${latest.text.split('\n')[0].slice(0, 80)}`);
    log.info(`parsed ${fileCount} identity file(s) from checkpoint`);

    // FIX2 #3: stage to .spore-staging/ first; only --apply swaps into
    // the workspace, with a timestamped backup of every overwritten file.
    // Never blind-overwrite SOUL.md / IDENTITY.md / USER.md / AGENTS.md.
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
    fs.mkdirSync(STAGING_DIR, { recursive: true });
    for (const [filename, content] of Object.entries(extracted)) {
      fs.writeFileSync(path.join(STAGING_DIR, filename), content, 'utf8');
      log.info(`  staged ${filename} (${content.length} bytes)`);
    }

    if (APPLY) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(WORKSPACE, `.spore-backup-${stamp}`);
      fs.mkdirSync(backupDir, { recursive: true });
      for (const filename of Object.keys(extracted)) {
        const dst = path.join(WORKSPACE, filename);
        if (fs.existsSync(dst)) {
          fs.copyFileSync(dst, path.join(backupDir, filename));
        }
        fs.copyFileSync(path.join(STAGING_DIR, filename), dst);
        log.info(`  applied ${filename} (backup at ${path.relative(WORKSPACE, backupDir)}/${filename})`);
      }
    } else {
      log.info('DRY-RUN: re-run with --apply to atomically swap staged files into the workspace');
    }

    if (book2Data?.messages?.length) {
      log.info(`operational state available in Book 2 (${book2Data.messages.length} messages)`);
    }
  } else {
    log.warn('no usable checkpoint from Nyanbook; checking local cache');
    const localExists = IDENTITY_FILES.every((f) => fs.existsSync(path.join(WORKSPACE, f)));
    if (localExists) {
      log.warn('local cache present — agent will run with last-known-good identity');
    } else {
      log.error('no local cache; agent is vanilla — no personal continuity');
    }
  }

  log.info(`spore-bootstrap done; source = ${source}; applied = ${APPLY && source === 'nyanbook'}`);

  // FIX2 #7b: only log result to Book 1 when (a) Book 1 was actually
  // reachable, (b) we actually applied something. Otherwise we are either
  // writing into a fire or recording a no-op. Includes host fingerprint
  // so multiple machines bootstrapping from the same token are auditable
  // (relates to the still-open single-writer concern flagged in the plan).
  if (h.book1?.ready && source === 'nyanbook' && APPLY) {
    try {
      await fetch(BOOK_1.endpoint, {
        method: 'POST',
        headers: { ...auth(BOOK_1.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: [
            `Spore Bootstrap (apply) — ${new Date().toISOString()}`,
            `Source: ${source}`,
            `Files: ${Object.keys(extracted).join(', ')}`,
            `Host: ${os.hostname()}`,
          ].join('\n'),
          username: 'void nyan',
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), // FIX2 #1: timeout on the write too
      });
    } catch (err) {
      log.error(`failed to log bootstrap result to Book 1: ${err.message}`);
    }
  }

  // FIX2 #5: non-zero exit when Book 1 was up but we produced no files.
  // Old script exited 0 on "Bootstrap complete" even with zero reconstruction.
  if (h.book1?.ready && source !== 'nyanbook') {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  bootstrap().catch((err) => {
    log.error(`spore-bootstrap fatal: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}

module.exports = { bootstrap, fetchBookMessages, parseCheckpoint, pickLatestCheckpoint };
