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
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ─── Dependencies ──────────────────────────────────────────────────
let ledger;
try {
  ledger = require('../nyanbook/ledger');
} catch {
  ledger = null;
}

const { WEBHOOK } = require('../nyanbook/config');

// ─── Paths ─────────────────────────────────────────────────────────
const WORKSPACE_DIR = process.env.OPENCLAW_WORKSPACE || '/Users/avijja/.openclaw/workspace';
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const NYAN_SYNC_LOG = path.join(MEMORY_DIR, 'NYAN_SYNC_LOG.md');
const LAST_SYNC_FILE = path.join(WORKSPACE_DIR, '.nyan-sync-last');

const RETRY_MS = 5000;
const TIMEOUT_MS = 10000;
const _pendingWebhook = [];

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

function _webhookRequest(urlStr, payload) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${WEBHOOK.token || ''}`
      },
      timeout: TIMEOUT_MS
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
    });

    req.on('error', () => resolve({ ok: false, error: true }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, timeout: true }); });
    req.write(data);
    req.end();
  });
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
    _pendingWebhook.push(payload);
    setTimeout(() => flushEvents(), RETRY_MS);
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
  _pendingWebhook.push(...remaining);
  return { flushed: count, remaining: remaining.length };
}

function getStatus() {
  return {
    local: { log: NYAN_SYNC_LOG, workspace: WORKSPACE_DIR },
    book2: { available: !!ledger },
    webhook: {
      enabled: WEBHOOK.enabled,
      url: WEBHOOK.enabled ? `${new URL(WEBHOOK.url).protocol}//${new URL(WEBHOOK.url).host}/...` : null,
      pending: _pendingWebhook.length
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
