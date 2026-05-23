/**
 * nyanbook-config — Environment-only, no secrets in source
 * Set: NYAN_PLAYGROUND_TOKEN, NYAN_BOOK1_TOKEN, NYAN_BOOK2_TOKEN
 */

const path = require('path');
const fs = require('fs');

// ─── Load .env.nyanbook if present ─────────────────────────────────
const envFile = path.resolve(__dirname, '../../.env.nyanbook');
if (fs.existsSync(envFile)) {
  // FIX #6: Replace narrow `export KEY="value"` parser with one that handles
  // unquoted values, single quotes, comments, blank lines, and optional `export`.
  const envContent = fs.readFileSync(envFile, 'utf8');
  envContent.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) return;
    const key = m[1];
    let val = m[2];
    // Strip trailing inline comment for unquoted values
    if (!/^["']/.test(val)) {
      const hash = val.indexOf(' #');
      if (hash !== -1) val = val.slice(0, hash);
    }
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

// ─── Token sources ─────────────────────────────────────────────────
// Priority: process.env > .env.nyanbook > null
// Tokens may be truncated in logs — never log full tokens

function getToken(name) {
  return process.env[name] || null;
}

function getCred(name) {
  const v = getToken(name);
  if (!v) {
    const err = new Error(`Credential ${name} not set. Add to .env.nyanbook: export ${name}="..."`);
    err.code = 'NYANBOOK_MISSING_CRED';
    err.missing = [name];
    throw err;
  }
  return v;
}

function maskToken(t) {
  if (!t) return '<missing>';
  if (t.length < 8) return '***';
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

// ─── Playground (AI inference) ─────────────────────────────────────
const PLAYGROUND = {
  baseUrl: 'https://nyanbook.replit.app',
  get token() { return getCred('NYAN_PLAYGROUND_TOKEN'); },
};

// ─── Ledger (Message books) ────────────────────────────────────────
const BOOK_1 = {
  id: 'dev_book_t1_5e832e817246',
  name: 'Avijja DC',
  endpoint: 'https://nyanbook.io/api/webhook/dev_book_t1_5e832e817246',
  get token() { return getCred('NYAN_BOOK1_TOKEN'); },
};

const BOOK_2 = {
  id: 'dev_book_t1_d19b12da5c19',
  name: 'Avijja 2nd Book',
  endpoint: 'https://nyanbook.io/api/webhook/dev_book_t1_d19b12da5c19',
  get token() { return getCred('NYAN_BOOK2_TOKEN'); },
};

// ─── Webhook (optional fire-and-forget target) ─────────────────────
const WEBHOOK = {
  get url() { return getToken('NYANBOOK_WEBHOOK_URL') || ''; },
  get token() { return getToken('NYANBOOK_BEARER_TOKEN') || ''; },
  get enabled() { return !!this.url; },
};

// ─── Auth helper ───────────────────────────────────────────────────
function auth(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── Health / diagnostics ──────────────────────────────────────────
function health() {
  return {
    playground: {
      baseUrl: PLAYGROUND.baseUrl,
      token: maskToken(getToken('NYAN_PLAYGROUND_TOKEN')),
      ready: !!getToken('NYAN_PLAYGROUND_TOKEN'),
    },
    book1: {
      name: BOOK_1.name,
      endpoint: BOOK_1.endpoint,
      token: maskToken(getToken('NYAN_BOOK1_TOKEN')),
      ready: !!getToken('NYAN_BOOK1_TOKEN'),
    },
    book2: {
      name: BOOK_2.name,
      endpoint: BOOK_2.endpoint,
      token: maskToken(getToken('NYAN_BOOK2_TOKEN')),
      ready: !!getToken('NYAN_BOOK2_TOKEN'),
    },
    webhook: {
      url: WEBHOOK.enabled ? `${new URL(WEBHOOK.url).protocol}//${new URL(WEBHOOK.url).host}/...` : null,
      ready: WEBHOOK.enabled,
    },
    envFile: fs.existsSync(envFile) ? envFile : '<not found>',
  };
}

// ─── Guard: fail fast if nyanbook needed but not configured ────────
function guard(required = ['playground', 'book1', 'book2']) {
  const h = health();
  const missing = [];
  if (required.includes('playground') && !h.playground.ready) missing.push('NYAN_PLAYGROUND_TOKEN');
  if (required.includes('book1') && !h.book1.ready) missing.push('NYAN_BOOK1_TOKEN');
  if (required.includes('book2') && !h.book2.ready) missing.push('NYAN_BOOK2_TOKEN');

  if (missing.length) {
    const err = new Error(
      `nyanbook not fully configured. Missing: ${missing.join(', ')}. ` +
      `Set in .env.nyanbook or process.env.`
    );
    err.code = 'NYANBOOK_MISSING_CONFIG';
    err.missing = missing;
    err.health = h;
    throw err;
  }
  return h;
}

// ─── Export ────────────────────────────────────────────────────────
module.exports = {
  PLAYGROUND,
  BOOK_1,
  BOOK_2,
  WEBHOOK,
  auth,
  health,
  guard,
  getToken,
  getCred,
  maskToken,
};
