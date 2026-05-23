// utils/data-package.js — Structured audit artifact for every pipeline run
// Inspired by BlueDream's DataPackage — simplified for OpenClaw workspace.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const MAX_PACKAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_PACKAGES = 100;

const _registry = new Map();

function generateId() {
  return `pkg_${crypto.randomBytes(4).toString('hex')}`;
}

class DataPackage {
  constructor(sessionId = 'default') {
    this.id = generateId();
    this.sessionId = sessionId;
    this.stages = {};
    this.createdAt = Date.now();
    this.completedAt = null;
    this.status = 'active';
  }

  writeStage(stageId, data) {
    this.stages[stageId] = {
      timestamp: Date.now(),
      data: typeof data === 'object' ? { ...data } : { value: data }
    };
  }

  readStage(stageId) {
    return this.stages[stageId]?.data || null;
  }

  getDuration() {
    const end = this.completedAt || Date.now();
    return end - this.createdAt;
  }

  getTokenUsage() {
    const reasoning = this.stages['S2']?.data || {};
    return {
      in: reasoning.tokensIn || 0,
      out: reasoning.tokensOut || 0,
      total: (reasoning.tokensIn || 0) + (reasoning.tokensOut || 0)
    };
  }

  complete(status = 'done') {
    this.completedAt = Date.now();
    this.status = status;
  }

  toJSON() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      status: this.status,
      stages: this.stages,
      durationMs: this.getDuration(),
      createdAt: new Date(this.createdAt).toISOString(),
      completedAt: this.completedAt ? new Date(this.completedAt).toISOString() : null
    };
  }

  toMarkdown() {
    const dur = this.getDuration();
    let md = `### 📦 ${this.id}\n`;
    md += `**Session:** \`${this.sessionId}\` | **Status:** ${this.status}\n`;
    md += `**Duration:** ${dur}ms\n\n`;
    for (const [stage, entry] of Object.entries(this.stages)) {
      md += `- **${stage}:** ${JSON.stringify(entry.data).slice(0, 100)}\n`;
    }
    return md + '\n';
  }
}

// Global package store with LRU eviction
function createPackage(sessionId) {
  if (_registry.size >= MAX_PACKAGES) {
    const oldest = _registry.keys().next().value;
    _registry.delete(oldest);
  }
  const pkg = new DataPackage(sessionId);
  _registry.set(pkg.id, pkg);
  return pkg;
}

function getPackage(id) {
  return _registry.get(id) || null;
}

function listPackages(limit = 20) {
  const pkgs = Array.from(_registry.values());
  pkgs.sort((a, b) => b.createdAt - a.createdAt);
  return pkgs.slice(0, limit);
}

function cleanupOldPackages() {
  const now = Date.now();
  const cutoff = now - MAX_PACKAGE_AGE_MS;
  let removed = 0;
  for (const [id, pkg] of _registry) {
    if (pkg.createdAt < cutoff) {
      _registry.delete(id);
      removed++;
    }
  }
  return removed;
}

module.exports = {
  DataPackage,
  createPackage,
  getPackage,
  listPackages,
  cleanupOldPackages
};
