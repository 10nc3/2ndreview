/**
 * spore-bootstrap.js — Recreate agent identity from Nyanbook.
 *
 * Usage:
 *   node lib/spore-bootstrap.js                   # DRY-RUN
 *   node lib/spore-bootstrap.js --apply           # atomically swap files in
 *   node lib/spore-bootstrap.js --force-nyanbook  # accept Book 1 even if quality check fails
 *
 * Tiers (Spore Protocol):
 *   1. Nyanbook Book 1 (primary)        — must pass write-quality check
 *   2. .spore-cache/<ts>/ (versioned)   — most recent successful nyanbook snapshot
 *   3. workspace identity files (raw)   — whatever happens to be on disk
 *   4. lib/spore-templates/ (seed)      — vanilla fallback; agent has no continuity
 *
 * Exit codes:
 *   0 — success (nyanbook or warm cache)
 *   1 — fatal error
 *   2 — Book 1 reachable but produced no usable checkpoint (operator action required)
 *   3 — vanilla bootstrap (templates written; no prior identity available)
 *
 * Every line change vs FIX2 baseline is tagged // FIX3 #N for line-by-line review:
 *   rg -n 'FIX3 #' lib/spore-bootstrap.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { BOOK_1, BOOK_2, auth, health } = require('./nyanbook/config');
const log = require('./log');

const IDENTITY_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md'];
const WORKSPACE = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(WORKSPACE, '.spore-staging');
const CACHE_DIR = path.join(WORKSPACE, '.spore-cache');           // FIX3 #1: versioned successful snapshots
const TEMPLATES_DIR = path.join(__dirname, 'spore-templates');    // FIX3 #3: seed tier
const FETCH_TIMEOUT_MS = Number(process.env.SPORE_FETCH_TIMEOUT_MS || 15000);
const MAX_CACHE_SNAPSHOTS = Number(process.env.SPORE_MAX_CACHE || 10);
const APPLY = process.argv.includes('--apply');
const FORCE_NYANBOOK = process.argv.includes('--force-nyanbook'); // FIX3 #2: escape hatch for testing

// ─── FIX2 fixes preserved verbatim ──────────────────────────────────────────

// FIX2 #1: timeout on every fetch.
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
    if (!data || typeof data !== 'object') throw new Error('unexpected response shape (not an object)');
    return data;
  } catch (err) {
    log.error(`fetch failed for ${book.name}: ${err.message}`);
    return null;
  }
}

// FIX2 #4: tighter checkpoint parser.
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

// FIX2 #2: sort candidates by timestamp DESC.
function tsOf(m) {
  const t = m.timestamp ?? m.created_at ?? m.ts ?? null;
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  if (typeof t === 'string') return Date.parse(t) || 0;
  return 0;
}
function pickLatestCheckpoint(messages) {
  if (!Array.isArray(messages)) return null;
  const candidates = messages.filter(
    (m) =>
      typeof m?.text === 'string' &&
      (m.text.includes('Checkpoint #') || m.text.includes('Build:') || m.text.includes('SOUL.md'))
  );
  if (!candidates.length) return null;
  candidates.sort((a, b) => tsOf(b) - tsOf(a));
  return candidates[0];
}

// ─── FIX3 #1: versioned local cache ─────────────────────────────────────────
// On every successful apply from Nyanbook, snapshot the just-written identity
// files into .spore-cache/<iso>/. Keeps last N (default 10) snapshots, prunes
// older ones. This is the *actual* cache layer the doc string always claimed.
function snapshotToCache(extracted) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(CACHE_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(extracted)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  // prune
  const all = fs
    .readdirSync(CACHE_DIR)
    .filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n))
    .sort()
    .reverse();
  for (const stale of all.slice(MAX_CACHE_SNAPSHOTS)) {
    fs.rmSync(path.join(CACHE_DIR, stale), { recursive: true, force: true });
  }
  return dir;
}

function latestCacheSnapshot() {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const snaps = fs
    .readdirSync(CACHE_DIR)
    .filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n))
    .sort()
    .reverse();
  if (!snaps[0]) return null;
  const dir = path.join(CACHE_DIR, snaps[0]);
  const ts = Date.parse(snaps[0].replace(/-/g, (c, i) => (i > 9 && i < 19 ? ':' : c))) || null;
  return { dir, name: snaps[0], timestampMs: ts };
}

// ─── FIX3 #2: write-quality / primary verification ──────────────────────────
// Reachability ≠ authority. Before declaring "source = nyanbook" we need to
// see that Book 1 contains at least one checkpoint-shaped message in the
// recent window AND that ≥1 of them parses to non-zero identity files.
// Otherwise Book 1 is reachable-but-stale and we should downgrade gracefully.
function assessBook1Quality(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return { ok: false, reason: 'no messages returned' };
  }
  const checkpoints = messages
    .filter(
      (m) =>
        typeof m?.text === 'string' &&
        (m.text.includes('Checkpoint #') || m.text.includes('Build:') || m.text.includes('SOUL.md'))
    )
    .sort((a, b) => tsOf(b) - tsOf(a));
  if (!checkpoints.length) {
    return { ok: false, reason: `no checkpoint-shaped messages in last ${messages.length}` };
  }
  let parseable = 0;
  for (const c of checkpoints.slice(0, 5)) {
    if (Object.keys(parseCheckpoint(c.text)).length > 0) parseable++;
  }
  if (parseable === 0) {
    return { ok: false, reason: `${checkpoints.length} checkpoint(s) found but none parsed to files` };
  }
  return { ok: true, parseable, recentCheckpoints: checkpoints.length };
}

// ─── FIX3 #4: staleness reporting ───────────────────────────────────────────
function ageDescription(timestampMs) {
  if (!timestampMs) return 'unknown age';
  const s = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (s < 60) return `${s}s old`;
  if (s < 3600) return `${Math.floor(s / 60)}m old`;
  if (s < 86400) return `${Math.floor(s / 3600)}h old`;
  return `${Math.floor(s / 86400)}d old`;
}

// ─── FIX3 #3: seed tier ─────────────────────────────────────────────────────
// When neither Book 1 nor local cache nor existing workspace files are usable,
// write templates from lib/spore-templates/ so the agent is at least bootable.
// Exit 3 signals "vanilla; no continuity" so callers can prompt for human seed.
function writeTemplatesToWorkspace() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  const written = [];
  for (const name of IDENTITY_FILES) {
    const src = path.join(TEMPLATES_DIR, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(WORKSPACE, name));
    written.push(name);
  }
  return written;
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

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

  // FIX3 #2: assess Book 1 quality before trusting it.
  let quality = null;
  if (book1Data) {
    quality = assessBook1Quality(book1Data.messages);
    if (quality.ok) {
      log.info(`Book 1 quality OK (${quality.parseable}/${Math.min(quality.recentCheckpoints, 5)} recent checkpoints parse)`);
    } else {
      log.warn(`Book 1 quality FAIL: ${quality.reason}`);
      if (!FORCE_NYANBOOK) log.warn('downgrading to local cache (pass --force-nyanbook to override)');
    }
  }

  const useNyanbook = quality?.ok || (FORCE_NYANBOOK && !!book1Data);
  const latest = useNyanbook ? pickLatestCheckpoint(book1Data.messages) : null;
  const extracted = latest ? parseCheckpoint(latest.text) : {};
  const fileCount = Object.keys(extracted).length;

  // FIX3 #4: source resolution now produces explicit tier + age.
  let source = 'vanilla';     // FIX3 #3 fallback default
  let sourceAge = 'no prior identity';
  let snapshotDir = null;

  if (fileCount > 0) {
    source = 'nyanbook';
    sourceAge = ageDescription(tsOf(latest));
  } else {
    const snap = latestCacheSnapshot();
    if (snap) {
      source = 'cache';
      sourceAge = ageDescription(snap.timestampMs);
      snapshotDir = snap.dir;
    } else if (IDENTITY_FILES.every((f) => fs.existsSync(path.join(WORKSPACE, f)))) {
      source = 'workspace';
      // Best-effort age = newest mtime among identity files.
      let newest = 0;
      for (const f of IDENTITY_FILES) {
        try { newest = Math.max(newest, fs.statSync(path.join(WORKSPACE, f)).mtimeMs); } catch {}
      }
      sourceAge = newest ? ageDescription(newest) : 'unknown age';
    }
  }

  log.info(`source tier resolved: ${source} (${sourceAge})`);

  // ─── Per-tier actions ────────────────────────────────────────────────────

  if (source === 'nyanbook') {
    log.info(`latest checkpoint: ${latest.text.split('\n')[0].slice(0, 80)}`);
    log.info(`parsed ${fileCount} identity file(s) from checkpoint`);

    // FIX2 #3: stage then atomic swap with backup.
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
        if (fs.existsSync(dst)) fs.copyFileSync(dst, path.join(backupDir, filename));
        fs.copyFileSync(path.join(STAGING_DIR, filename), dst);
        log.info(`  applied ${filename} (backup at ${path.relative(WORKSPACE, backupDir)}/${filename})`);
      }
      // FIX3 #1: snapshot to versioned cache so future fallbacks have a known-good copy.
      const snap = snapshotToCache(extracted);
      log.info(`  cache snapshot -> ${path.relative(WORKSPACE, snap)}`);
    } else {
      log.info('DRY-RUN: re-run with --apply to atomically swap staged files into the workspace');
    }
  } else if (source === 'cache') {
    log.warn(`Nyanbook unusable; restoring from cache snapshot ${path.basename(snapshotDir)}`);
    if (APPLY) {
      for (const f of IDENTITY_FILES) {
        const src = path.join(snapshotDir, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(WORKSPACE, f));
          log.info(`  restored ${f} from cache`);
        }
      }
    } else {
      log.info('DRY-RUN: re-run with --apply to restore identity files from cache');
    }
  } else if (source === 'workspace') {
    log.warn('Nyanbook unusable and no cache snapshot; running on raw workspace files');
    log.warn(`identity files on disk are ${sourceAge} — staleness is best-effort (mtime)`);
  } else {
    // FIX3 #3: vanilla tier.
    log.error('no nyanbook, no cache, no workspace files');
    if (APPLY) {
      const written = writeTemplatesToWorkspace();
      if (written.length) {
        log.warn(`seeded vanilla identity from templates: ${written.join(', ')}`);
        log.warn('agent has NO personal continuity until a human fills these in');
      } else {
        log.error('no templates available either — agent cannot bootstrap');
      }
    } else {
      log.info('DRY-RUN: re-run with --apply to write vanilla templates');
    }
  }

  if (book2Data?.messages?.length) {
    log.info(`operational state available in Book 2 (${book2Data.messages.length} messages)`);
  }

  log.info(`spore-bootstrap done; source = ${source}; age = ${sourceAge}; applied = ${APPLY && source !== 'workspace'}`);

  // FIX2 #7: only audit-log to Book 1 on actual apply that touched files.
  if (h.book1?.ready && APPLY && (source === 'nyanbook' || source === 'cache' || source === 'vanilla')) {
    try {
      await fetch(BOOK_1.endpoint, {
        method: 'POST',
        headers: { ...auth(BOOK_1.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: [
            `Spore Bootstrap (apply) — ${new Date().toISOString()}`,
            `Source: ${source}`,
            `Age: ${sourceAge}`,
            `Files: ${source === 'nyanbook' ? Object.keys(extracted).join(', ') : IDENTITY_FILES.join(', ')}`,
            `Host: ${os.hostname()}`,
            quality && !quality.ok ? `Book1-quality: FAIL (${quality.reason})` : null,
          ].filter(Boolean).join('\n'),
          username: 'void nyan',
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      log.error(`failed to log bootstrap result to Book 1: ${err.message}`);
    }
  }

  // Exit codes
  if (source === 'vanilla') process.exitCode = 3;                  // FIX3 #3
  else if (h.book1?.ready && source !== 'nyanbook') process.exitCode = 2;  // FIX2 #5 (preserved)
}

if (require.main === module) {
  bootstrap().catch((err) => {
    log.error(`spore-bootstrap fatal: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}

module.exports = {
  bootstrap,
  fetchBookMessages,
  parseCheckpoint,
  pickLatestCheckpoint,
  assessBook1Quality,
  snapshotToCache,
  latestCacheSnapshot,
  ageDescription,
};
