/**
 * lib/sync/workspace-sync.js — Merged workspace sync engine
 * Unified replacement for lib/nyan-sync.js + lib/nyanbook-sync.js (webhook legacy)
 *
 * Targets (pluggable):
 *   - local:    append to NYAN_SYNC_LOG.md (always)
 *   - book2:    ledgerAppend to nyanbook Book 2 (dual-write)
 *   - webhook:  fire-and-forget POST to NYANBOOK_WEBHOOK_URL (event-only)
 *
 * Usage:
 *   const sync = require('./lib/sync/workspace-sync');
 *   await sync.syncWorkspace();          // full scan → local + optional book2
 *   await sync.logEvent({ event:'build.complete', data:{} }); // webhook only
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// ─── Dependencies ──────────────────────────────────────────────────
let ledger;
try {
  ledger = require('../nyanbook/ledger');
} catch {
  ledger = null;
}

const { WEBHOOK } = require('../nyanbook/config');

// ─── Paths ─────────────────────────────────────────────────────────
// FIX #1: Default WORKSPACE_DIR is now portable (~/.openclaw/workspace via
// os.homedir(), with cwd as the ultimate fallback). The hardcoded
// /Users/avijja path broke every non-macOS environment.
const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE
  || path.join(os.homedir() || process.cwd(), '.openclaw', 'workspace');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const NYAN_SYNC_LOG = path.join(MEMORY_DIR, 'NYAN_SYNC_LOG.md');
const LAST_SYNC_FILE = path.join(WORKSPACE_DIR, '.nyan-sync-last');

const RETRY_MS = 5000;
const TIMEOUT_MS = 10000;
// FIX #12: Cap the in-memory retry queue so a long webhook outage cannot
// grow it without bound. Oldest entries are dropped first.
const MAX_PENDING = 1000;
const _pendingWebhook = [];

function _enqueuePending(payload) {
  _pendingWebhook.push(payload);
  while (_pendingWebhook.length > MAX_PENDING) _pendingWebhook.shift();
}

// FIX #7 / #11: Single timeout helper, shared by all fetch callers.
function timeoutSignal(ms = TIMEOUT_MS) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms).unref?.();
  return ctrl.signal;
}

// ─── Internal ──────────────────────────────────────────────────────
async function getLastSync() {
  try {
    const ts = await fs.readFile(LAST_SYNC_FILE, 'utf8');
    return new Date(ts.trim());
  } catch {
    return new Date(0);
  }
}

async function setLastSync(date = new Date()) {
  await fs.writeFile(LAST_SYNC_FILE, date.toISOString());
}

function formatEntry(file, content, remoteResult = null) {
  const ts = new Date().toISOString();
  return `\n## ${ts} — ${file.name}\n` +
    `**Mtime:** ${file.mtime.toISOString()} | **Size:** ${content.length} chars\n\n` +
    `\`\`\`\n${content.slice(0, 1500)}\n${content.length > 1500 ? '\n... [truncated]\n' : ''}\`\`\`\n` +
    (remoteResult ? `\n**Remote (${remoteResult.target}):** ${remoteResult.success ? '✅ synced' : `❌ ${remoteResult.status}`}\n` : '');
}

async function saveLocal(entryText) {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    await fs.appendFile(NYAN_SYNC_LOG, entryText, 'utf8');
    return { success: true, path: NYAN_SYNC_LOG };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function findChangedFiles(since) {
  const files = [];
  const dirs = [WORKSPACE_DIR, MEMORY_DIR];

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'NYAN_SYNC_LOG.md') {
          const fullPath = path.join(dir, entry.name);
          const stat = await fs.stat(fullPath);
          if (stat.mtime > since) {
            files.push({ path: fullPath, name: entry.name, mtime: stat.mtime });
          }
        }
      }
    } catch {
      // dir might not exist
    }
  }
  return files;
}

// ─── Targets ───────────────────────────────────────────────────────
async function pushBook2(entry) {
  if (!ledger) return { skipped: true, reason: 'ledger module unavailable' };
  try {
    const r = await ledger.ledgerAppend({
      type: 'sync',
      file: entry.file,
      mtime: entry.mtime,
      contentPreview: entry.content.slice(0, 2000),
      size: entry.content.length,
    }, 'book_2');
    return { success: true, ...r };
  } catch (e) {
    return { success: false, status: e.message, target: 'book_2' };
  }
}

// FIX #11: Replace raw http/https implementation with fetch + AbortSignal.
// Drops ~25 lines of boilerplate and unifies error handling with the rest
// of the codebase.
async function _webhookRequest(urlStr, payload) {
  try {
    const res = await fetch(urlStr, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBHOOK.token || ''}`,
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal(),
    });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return { ok: false, timeout: true };
    }
    return { ok: false, error: true, message: e.message };
  }
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Full workspace sync: scan changed files → local log + optional book2
 */
async function syncWorkspace(opts = {}) {
  const { book2 = true } = opts;
  const since = await getLastSync();
  const changed = await findChangedFiles(since);

  if (changed.length === 0) {
    return { synced: 0, message: 'No changes since last sync' };
  }

  const results = [];

  for (const file of changed) {
    try {
      const content = await fs.readFile(file.path, 'utf8');

      let remoteResult = null;
      if (book2) {
        remoteResult = await pushBook2({ file: file.name, mtime: file.mtime.toISOString(), content });
      }

      const entryText = formatEntry(file, content, remoteResult);
      const localResult = await saveLocal(entryText);

      results.push({
        file: file.name,
        local: localResult.success ? 'saved' : `error: ${localResult.error}`,
        remote: remoteResult ? (remoteResult.success ? 'synced' : `failed: ${remoteResult.status}`) : 'skipped',
      });
    } catch (e) {
      results.push({ file: file.name, error: e.message });
    }
  }

  await setLastSync();
  return { synced: changed.length, results };
}

/**
 * Fire-and-forget event log to webhook. Never throws.
 */
async function logEvent(entry, retry = true) {
  if (!WEBHOOK.enabled) return { skipped: true, reason: 'no webhook configured' };

  const payload = {
    timestamp: new Date().toISOString(),
    ...entry
  };

  const result = await _webhookRequest(WEBHOOK.url, payload);

  if (!result.ok && retry) {
    _enqueuePending(payload);                                   // FIX #12
    setTimeout(() => flushEvents(), RETRY_MS).unref?.();
  }
  return result;
}

async function flushEvents() {
  if (_pendingWebhook.length === 0 || !WEBHOOK.enabled) return { flushed: 0 };
  let count = 0;
  const remaining = [];

  for (const payload of _pendingWebhook) {
    const result = await _webhookRequest(WEBHOOK.url, payload);
    if (result.ok) count++;
    else remaining.push(payload);
  }

  _pendingWebhook.length = 0;
  // FIX #12: even on flush, respect the cap.
  for (const p of remaining) _enqueuePending(p);
  return { flushed: count, remaining: _pendingWebhook.length };
}

function getStatus() {
  return {
    local: { log: NYAN_SYNC_LOG, workspace: WORKSPACE_DIR },
    book2: { available: !!ledger },
    webhook: {
      enabled: WEBHOOK.enabled,
      url: WEBHOOK.enabled ? `${new URL(WEBHOOK.url).protocol}//${new URL(WEBHOOK.url).host}/...` : null,
      pending: _pendingWebhook.length,
      pendingCap: MAX_PENDING,                                  // FIX #12
    }
  };
}

// ─── CLI ───────────────────────────────────────────────────────────
if (require.main === module) {
  syncWorkspace().then(r => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.results?.some(x => x.error) ? 1 : 0);
  }).catch(e => {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  });
}

module.exports = {
  syncWorkspace,
  logEvent,
  flushEvents,
  getStatus,
  findChangedFiles,
};
