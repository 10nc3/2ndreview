// lib/context-router.js — Expert Context Router
// Trigger-based file loading. Core always; experts load on keyword match.
// Inspired by Probably Nothing's intent-detector + BlueDream's context extractor.

const TRIGGERS = {
  core: { files: ['USER.md', 'IDENTITY.md', 'SOUL.md', 'lib/nyanbook/config.js'], always: true },
  philosophy: {
    files: ['reference/PHILOSOPHY.md'],
    keywords: ['φ', 'phi', 'nyan', 'genesis', 'dimension', 'koan', 'tetralemma',
               'paticca', 'dependent', 'impermanence', 'void', 'substrate',
               'ontology', 'logos', 'fire', 'gougu', 'golden']
  },
  memory: {
    files: ['memory/rolling-summary.md'],
    keywords: ['remember', 'past', 'yesterday', 'earlier', 'before',
               'context', 'what did we', 'history', 'recall']
  },
  tools: {
    files: ['TOOLS.md', 'reference/TOOLS.md'],
    keywords: ['price', 'weather', 'api', 'token',
               'model', 'ollama', 'search', 'tool', 'skill', 'cron']
  },
  nyanbook: {
    files: ['lib/nyanbook/playground.js', 'lib/nyanbook/ledger.js'],
    keywords: ['nyanbook', 'psi-ema', 'seed-metric', 'stock', 'ticker',
               'ema', 'golden ratio', 'φ²', 'affordability', 'fertility',
               'ledger', 'book sync', 'cascade', 'grounding'],
  },
  runbook: {
    files: ['runbooks/RUNBOOK.md', 'runbooks/health-check.md'],
    keywords: ['how to', 'procedure', 'runbook', 'check', 'audit',
               'health', 'smoke', 'test', 'verify']
  },
  build: {
    files: ['runbooks/BUILD-v2.md'],
    keywords: ['build', 'pipeline', 'deploy', 'kernel', 'satellite',
               'architecture', 'refactor', 'structure']
  }
};

function route(query) {
  if (!query) return ['core'];
  const q = query.toLowerCase();
  const experts = new Set(['core']);

  for (const [name, config] of Object.entries(TRIGGERS)) {
    if (config.always) continue;
    if (config.keywords.some(k => q.includes(k.toLowerCase()))) {
      experts.add(name);
    }
  }
  return Array.from(experts);
}

function getExpertFiles(experts) {
  const seen = new Set();
  const files = [];
  for (const expert of experts) {
    const config = TRIGGERS[expert];
    if (!config) continue;
    for (const f of config.files) {
      if (seen.has(f)) continue;
      seen.add(f);
      files.push(f);
    }
  }
  return files;
}

function getRouterStats() {
  return Object.entries(TRIGGERS).map(([name, config]) => ({
    name,
    always: config.always || false,
    fileCount: config.files.length,
    keywordCount: config.keywords ? config.keywords.length : 0
  }));
}

module.exports = { route, getExpertFiles, getRouterStats, TRIGGERS };
