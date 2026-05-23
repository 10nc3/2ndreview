/**
 * nyanbook-ledger — Append-only storage endpoint
 * Default target: Book 2 (agent workspace sync)
 * Book 1: your journal — must be explicitly requested
 *
 * Auto-loads config. Never goes limbo — fails fast with clear error.
 */

const { BOOK_1, BOOK_2, BOOK_3, BOOK_4, auth, health, guard } = require('./config');

// FIX #7: Centralised fetch timeout. AbortSignal.timeout requires Node ≥17.3;
// fall back gracefully on older runtimes.
const FETCH_TIMEOUT_MS = 15000;
function timeoutSignal(ms = FETCH_TIMEOUT_MS) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms).unref?.();
  return ctrl.signal;
}

function getBook(target = 'book_2') {
  if (target === 'book_1' || target === 'journal') {
    return { url: BOOK_1.endpoint, token: BOOK_1.token, name: BOOK_1.name };
  }
  if (target === 'book_3' || target === 'spare') {
    return { url: BOOK_3.endpoint, token: BOOK_3.token, name: BOOK_3.name };
  }
  if (target === 'book_4' || target === 'reserve' || target === 'archive') {
    return { url: BOOK_4.endpoint, token: BOOK_4.token, name: BOOK_4.name };
  }
  return { url: BOOK_2.endpoint, token: BOOK_2.token, name: BOOK_2.name };
}

function getAuth(target = 'book_2') {
  const book = getBook(target);
  return { url: book.url, headers: auth(book.token) };
}

async function ledgerAppend(entry, target = 'book_2') {
  const book = getAuth(target);

  // FIX #2: Spread caller entry FIRST, then overlay canonical fields so
  // text/username/timestamp/source can never be silently overwritten by the
  // caller. Previously `...entry` came after and clobbered these values.
  const payload = {
    ...entry,
    text: entry.text || entry.content || JSON.stringify(entry),
    username: entry.username || 'void nyan',
    timestamp: new Date().toISOString(),
    source: 'openclaw',
  };

  const res = await fetch(book.url, {
    method: 'POST',
    headers: book.headers,
    body: JSON.stringify(payload),
    signal: timeoutSignal(),                                    // FIX #7
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '<no body>');
    throw new Error(
      `ledgerAppend failed: ${res.status} ${res.statusText} — ${errBody}`
    );
  }

  return {
    success: true,
    status: res.status,
    target,
    bookName: target === 'book_1' ? BOOK_1.name
             : target === 'book_3' || target === 'spare' ? BOOK_3.name
             : target === 'book_4' || target === 'reserve' || target === 'archive' ? BOOK_4.name
             : BOOK_2.name,
  };
}

async function ledgerRead(target = 'book_2', opts = {}) {
  const { limit = 20, before, after } = opts;
  const book = getAuth(target);

  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  if (after) params.set('after', after);

  const url = `${book.url}/messages${params.toString() ? '?' + params.toString() : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: book.headers,
    signal: timeoutSignal(),                                    // FIX #7
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '<no body>');
    throw new Error(
      `ledgerRead failed: ${res.status} ${res.statusText} — ${errBody}`
    );
  }

  return res.json();
}

// ─── Health check ──────────────────────────────────────────────────
async function ledgerHealth() {
  const h = health();
  let book1Read = null;
  let book2Read = null;
  let book3Read = null;
  let book4Read = null;

  try {
    const r1 = await ledgerRead('book_1', { limit: 1 });
    book1Read = { ok: true, messages: r1.total };
  } catch (e) {
    book1Read = { ok: false, error: e.message };
  }

  try {
    const r2 = await ledgerRead('book_2', { limit: 1 });
    book2Read = { ok: true, messages: r2.total };
  } catch (e) {
    book2Read = { ok: false, error: e.message };
  }

  try {
    const r3 = await ledgerRead('book_3', { limit: 1 });
    book3Read = { ok: true, messages: r3.total };
  } catch (e) {
    book3Read = { ok: false, error: e.message };
  }

  try {
    const r4 = await ledgerRead('book_4', { limit: 1 });
    book4Read = { ok: true, messages: r4.total };
  } catch (e) {
    book4Read = { ok: false, error: e.message };
  }

  return {
    config: h,
    book1: book1Read,
    book2: book2Read,
    book3: book3Read,
    book4: book4Read,
    ready: h.book1.ready && h.book2.ready && h.book3.ready && h.book4.ready && book1Read?.ok && book2Read?.ok && book3Read?.ok && book4Read?.ok,
  };
}

module.exports = {
  ledgerAppend,
  ledgerRead,
  ledgerHealth,
  getBook,
  getAuth,
};
