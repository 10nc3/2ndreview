// lib/pipeline-state.js — 8-Stage Pipeline State Machine
// Cognitive architecture, not necessarily code path.
// Synthesis: Probably Nothing's void-pipeline + BlueDream's orchestrator.

const { routeTemperature } = require('./temperature-router');
const { PhiMemory } = require('./phi-memory');

const PIPELINE_STEPS = {
  CONTEXT_EXTRACT: 'S-1',
  DIGEST:          'S-1.5',
  PREFLIGHT:       'S0',
  CONTEXT_BUILD:   'S1',
  REASONING:       'S2',
  AUDIT:           'S3',
  RETRY:           'S4',
  PERSONALITY:     'S5',
  OUTPUT:          'S6'
};

const MODES = {
  ANSWER:   'answer',   // describe — Q&A, reminders, chat
  PLAN:     'plan',     // scribe — architect, design, draft
  BUILD:    'build'     // prescribe — execute plans (owner only)
};

class PipelineState {
  constructor(query = '', callerId = null) {
    this.step = PIPELINE_STEPS.CONTEXT_EXTRACT;
    this.retryCount = 0;
    this.maxRetries = 1;
    this.mode = MODES.ANSWER;
    this.query = query;
    this.callerId = callerId;
    this.temperature = null;
    this.phiMemory = new PhiMemory(callerId || 'default');
    this.context = {
      experts: [],
      filesLoaded: [],
      tokenEstimate: 0
    };
    this.reasoning = {
      provider: null,
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      response: null
    };
    this.audit = {
      passed: null,
      checks: [],
      errors: []
    };
    this.output = {
      type: null,  // 'reply', 'file_write', 'exec', 'none'
      filesModified: [],
      memoryWritten: false
    };
    this.error = null;
    this.startedAt = Date.now();
    this.completedAt = null;
  }

  /**
   * Bootstrap φ-memory from NyanBook ledger on session start.
   */
  async bootstrapMemory() {
    return this.phiMemory.bootstrap();
  }

  /**
   * Add a message to the ephemeral φ-8 window and bump query count.
   * Compresses and pushes to ledger every 2nd query.
   */
  async addMessage(role, content, meta = {}) {
    this.phiMemory.add(role, content, meta);
    return this.phiMemory.bumpQuery();
  }

  /**
   * Get full context: ledger-restored summaries + recent φ-8 window.
   */
  getMemoryContext() {
    return this.phiMemory.getContext();
  }

  transition(nextStep) {
    this.step = nextStep;
  }

  setMode(mode) {
    if (Object.values(MODES).includes(mode)) {
      this.mode = mode;
    }
  }

  setContext(experts, files, tokenEstimate) {
    this.context = { experts, filesLoaded: files, tokenEstimate };
  }

  setReasoning(provider, model, tokensIn, tokensOut, latencyMs, response) {
    this.reasoning = { provider, model, tokensIn, tokensOut, latencyMs, response };
  }

  setTemperature(intent = null, query = '') {
    const r = routeTemperature(intent, query || this.query);
    this.temperature = r;
    return r;
  }

  setAudit(passed, checks = [], errors = []) {
    this.audit = { passed, checks, errors };
  }

  setOutput(type, filesModified = [], memoryWritten = false) {
    this.output = { type, filesModified, memoryWritten };
  }

  setError(error, recoverable = false) {
    this.error = { message: error.message || error, stack: error.stack, recoverable };
    this.step = 'ERROR';
  }

  complete() {
    this.completedAt = Date.now();
  }

  /**
   * Convert this pipeline run into a DataPackage audit artifact.
   */
  toDataPackage() {
    const { createPackage } = require('../utils/data-package');
    const pkg = createPackage(this.callerId || 'default');

    pkg.writeStage('S-1', {
      experts: this.context.experts,
      filesLoaded: this.context.filesLoaded,
      tokenEstimate: this.context.tokenEstimate
    });

    pkg.writeStage('S0', { mode: this.mode });

    pkg.writeStage('S1', {
      experts: this.context.experts,
      fileCount: this.context.filesLoaded.length
    });

    pkg.writeStage('S2', {
      ...this.reasoning,
      temperature: this.temperature ? this.temperature.temp : null,
      tempKey: this.temperature ? this.temperature.key : null
    });

    pkg.writeStage('S3', {
      passed: this.audit.passed,
      checks: this.audit.checks,
      errors: this.audit.errors
    });

    pkg.writeStage('S6', {
      outputType: this.output.type,
      filesModified: this.output.filesModified,
      memoryWritten: this.output.memoryWritten
    });

    pkg.complete(this.error ? 'error' : 'done');
    return pkg;
  }

  toJSON() {
    return {
      step: this.step,
      mode: this.mode,
      query: this.query,
      context: this.context,
      reasoning: this.reasoning,
      audit: this.audit,
      output: this.output,
      error: this.error,
      durationMs: this.completedAt ? this.completedAt - this.startedAt : null,
      timestamp: new Date(this.startedAt).toISOString()
    };
  }

  toMarkdown() {
    const ts = new Date(this.startedAt).toISOString();
    const dur = this.completedAt ? ` (${this.completedAt - this.startedAt}ms)` : '';
    let md = `## Pipeline Run${dur}\n**Query:** ${this.query}\n**Mode:** \`${this.mode}\` → \`${this.step}\`\n\n`;
    md += `**Context:** ${this.context.experts.join(', ') || 'core'} — ${this.context.filesLoaded.length} files\n`;
    if (this.reasoning.provider) {
      md += `**Reasoning:** ${this.reasoning.provider}/${this.reasoning.model} (${this.reasoning.tokensIn}+${this.reasoning.tokensOut} tokens)\n`;
    }
    if (this.audit.passed !== null) {
      md += `**Audit:** ${this.audit.passed ? 'PASS' : 'FAIL'} — ${this.audit.checks.length} checks\n`;
    }
    if (this.output.type) {
      md += `**Output:** ${this.output.type} — ${this.output.filesModified.length} files modified\n`;
    }
    if (this.error) {
      md += `**ERROR:** ${this.error.message}\n`;
    }
    return md + '\n---\n';
  }
}

module.exports = { PipelineState, PIPELINE_STEPS, MODES };
