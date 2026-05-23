// lib/temperature-router.js — Temperature Routing for LLM Calls
// BlueDream's temperature system: deterministic → creative spectrum.
// Maps cognitive operation to optimal temperature for that task.

const ROUTES = {
  // Near-zero: zero hallucination tolerance
  deterministic: { temp: 0,    desc: 'Tool calls, structured extraction, verbatim data' },
  strict:        { temp: 0.05, desc: 'Query classification, routing, keyword matching' },
  precise:       { temp: 0.1,  desc: 'Audit paths, chain-of-thought verification' },
  reasoning:     { temp: 0.15, desc: 'Search-augmented responses, multi-step logic' },
  audit:         { temp: 0.2,  desc: 'Two-pass audit, claim verification' },
  summarization: { temp: 0.3,  desc: 'Memory compression, summarization' },
  balanced:      { temp: 0.5,  desc: 'General chat when no specific route matched' },
  creative:      { temp: 0.7,  desc: 'Storytelling, analogies, persona formatting' }
};

/**
 * Route a task descriptor to optimal temperature
 * @param {string|null} [intent] — explicit ROUTES key, or null for auto-detect
 * @param {string} [query] — query text for auto-detection when intent is null/omitted
 */
function routeTemperature(intent = null, query = '') {
  if (intent && ROUTES[intent]) return { ...ROUTES[intent], key: intent };

  const q = (query || '').toLowerCase();
  if (/\b(summary|compress|summarize|tldr)\b/.test(q)) return { ...ROUTES.summarization, key: 'summarization' };
  if (/\b(audit|verify|fact.?check|double.?check)\b/.test(q)) return { ...ROUTES.audit, key: 'audit' };
  if (/\b(calculate|derive|compute|formula|equation)\b/.test(q)) return { ...ROUTES.deterministic, key: 'deterministic' };
  if (/\b(classify|route|detect|identify)\b/.test(q)) return { ...ROUTES.strict, key: 'strict' };
  if (/\b(story|analogy|imagine|creative|poem|joke)\b/.test(q)) return { ...ROUTES.creative, key: 'creative' };
  if (/\b(why|how|explain|reason|because)\b/.test(q)) return { ...ROUTES.reasoning, key: 'reasoning' };

  return { ...ROUTES.balanced, key: 'balanced' };
}

/**
 * Format temperature + rationale for system prompt injection
 */
function formatTempDirective(intent) {
  const r = routeTemperature(intent);
  return `Temperature: ${r.temp} (${r.key}) — ${r.desc}`;
}

module.exports = { ROUTES, routeTemperature, formatTempDirective };
