// lib/pii-guard.js — PII Stripping & Input Sanitization
// Lightweight regex-based guards. Applied before logging and external posting.

const PII_PATTERNS = [
  { re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, label: '[email]' },
  { re: /(?:\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,5}/g, label: '[phone]' },
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, label: '[SSN]' },
  { re: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, label: '[ccard]' },
  { re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, label: '[ip]' },
];

function stripPII(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  for (const { re, label } of PII_PATTERNS) {
    out = out.replace(re, label);
  }
  return out;
}

function isClean(text) {
  if (!text) return true;
  return PII_PATTERNS.every(({ re }) => !re.test(text));
}

function audit(text) {
  const findings = [];
  for (const { re, label } of PII_PATTERNS) {
    const found = text.match(re);
    if (found) findings.push({ type: label, count: found.length });
  }
  return { clean: findings.length === 0, findings };
}

module.exports = { stripPII, isClean, audit, PII_PATTERNS };
