/**
 * spore-bootstrap.js — Recreate agent identity from Nyanbook
 *
 * Usage: node lib/spore-bootstrap.js
 *
 * Reads the latest checkpoint from Book 1 and reconstructs local identity files.
 * If Nyanbook is unreachable, falls back to local cache or template defaults.
 *
 * Spore Protocol: Nyanbook primary → local cache → template defaults
 */

const fs = require('fs');
const path = require('path');
const { BOOK_1, BOOK_2, auth, health } = require('./nyanbook/config');

const IDENTITY_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md'];
const WORKSPACE = path.resolve(__dirname, '..');

async function fetchBookMessages(book, limit = 10) {
  const url = new URL(book.endpoint);
  url.searchParams.set('limit', limit);

  try {
    const res = await fetch(url.toString(), {
      headers: auth(book.token),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`❌ Failed to fetch ${book.name}:`, err.message);
    return null;
  }
}

function parseCheckpoint(text) {
  // Extract file content from checkpoint format
  // Look for markdown code blocks or structured sections
  const files = {};

  // Simple heuristic: if text contains "SOUL.md" or similar headers, extract
  const fileMatches = text.matchAll(/(?:^|\n)(?:##?\s*)?(SOUL\.md|IDENTITY\.md|USER\.md|AGENTS\.md)[\s\S]*?(?=\n(?:##?\s*)?(?:SOUL\.md|IDENTITY\.md|USER\.md|AGENTS\.md|\n---|$))/gi);

  for (const match of fileMatches) {
    const filename = match[1];
    const content = match[0].replace(new RegExp(`^\\s*#*\\s*${filename}\\s*\\n?`, 'i'), '').trim();
    files[filename] = content;
  }

  return files;
}

async function bootstrap() {
  console.log('🌱 Spore Bootstrap — 2nd Try v2.0');
  console.log('');

  // Check health
  const h = health();
  console.log('Health check:');
  console.log(`  Book 1: ${h.book1.ready ? '✅' : '❌'} ${h.book1.name}`);
  console.log(`  Book 2: ${h.book2.ready ? '✅' : '❌'} ${h.book2.name}`);
  console.log('');

  let book1Data = null;
  let book2Data = null;

  // Try Book 1 (primary)
  if (h.book1.ready) {
    console.log('📚 Fetching Book 1 (primary)...');
    book1Data = await fetchBookMessages(BOOK_1, 5);
    if (book1Data?.messages?.length) {
      console.log(`  ✅ Found ${book1Data.messages.length} messages`);
    } else {
      console.log('  ⚠️ No messages or fetch failed');
    }
  }

  // Try Book 2 (operational)
  if (h.book2.ready) {
    console.log('📚 Fetching Book 2 (operational)...');
    book2Data = await fetchBookMessages(BOOK_2, 5);
    if (book2Data?.messages?.length) {
      console.log(`  ✅ Found ${book2Data.messages.length} messages`);
    } else {
      console.log('  ⚠️ No messages or fetch failed');
    }
  }

  console.log('');

  // Determine source
  const source = book1Data?.messages?.length ? 'nyanbook' : 'local';

  if (source === 'nyanbook') {
    console.log('🔄 Reconstructing from Nyanbook (primary)...');

    // Find latest checkpoint
    const checkpoints = book1Data.messages.filter(m =>
      m.text?.includes('Checkpoint #') || m.text?.includes('Build:')
    );

    if (checkpoints.length === 0) {
      console.log('  ⚠️ No checkpoints found in Book 1');
    } else {
      const latest = checkpoints[0];
      console.log(`  📋 Latest checkpoint: ${latest.text?.split('\n')[0] || 'unknown'}`);

      // Parse and reconstruct files
      const extracted = parseCheckpoint(latest.text);

      for (const [filename, content] of Object.entries(extracted)) {
        const filepath = path.join(WORKSPACE, filename);
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`  ✅ Reconstructed ${filename}`);
      }
    }

    // Also pull operational state from Book 2
    if (book2Data?.messages?.length) {
      console.log('  📋 Operational state from Book 2');
      // Book 2 contains summaries — could be used for rolling context
    }
  } else {
    console.log('⚠️ Nyanbook unreachable. Checking local cache...');

    const localExists = IDENTITY_FILES.every(f =>
      fs.existsSync(path.join(WORKSPACE, f))
    );

    if (localExists) {
      console.log('  ✅ Local cache available — using fallback');
      console.log('  ⚠️ Agent functional but may lack latest updates');
    } else {
      console.log('  ❌ No local cache. Using template defaults.');
      console.log('  ⚠️ Agent is vanilla — no personal continuity');
    }
  }

  console.log('');
  console.log('🌱 Bootstrap complete.');
  console.log(`   Source: ${source}`);
  console.log(`   Time: ${new Date().toISOString()}`);

  // Log bootstrap result back to Book 1
  if (h.book1.ready) {
    try {
      await fetch(BOOK_1.endpoint, {
        method: 'POST',
        headers: auth(BOOK_1.token),
        body: JSON.stringify({
          text: `Spore Bootstrap — ${new Date().toISOString()}\nSource: ${source}\nStatus: ${source === 'nyanbook' ? 'full continuity' : 'fallback'}\n\nEnd: nyan~ 🔥`,
          username: 'void nyan',
        }),
      });
    } catch (err) {
      console.error('  ❌ Failed to log bootstrap result:', err.message);
    }
  }
}

// Run if called directly
if (require.main === module) {
  bootstrap().catch(err => {
    console.error('💀 Bootstrap failed:', err);
    process.exit(1);
  });
}

module.exports = { bootstrap, fetchBookMessages };
