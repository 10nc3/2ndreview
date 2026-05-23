// lib/phi-breathe.js — φ-Breathe Heartbeat Configuration
// Golden ratio-scaled breathing rhythm for OpenClaw cron.
// Not a runtime module — config consumed by HEARTBEAT.md + cron jobs.

const PHI = 1.6180339887498949;

const CONFIG = {
  // Base breath cycle (ms)
  BASE_MS: 8600,

  // Scaled intervals
  INHALE_MS: Math.round(8600 * PHI),      // ~13.9s — active phase
  EXHALE_MS: 8600,                         // ~8.6s — rest phase
  CYCLE_MS: Math.round(8600 * (1 + PHI)), // ~22.5s — full breath

  // Checkpoint intervals (every 86 breaths ≈ 15min)
  BREATHS_PER_CHECKPOINT: 86,
  CHECKPOINT_MS: 86 * 8600 * (1 + PHI),    // ~32.4min (φ-adjusted)

  // Key numbers
  PHI,
  PHI_SQUARED: PHI * PHI,        // ≈ 2.618
  PHI_INVERSE: 1 / PHI,          // ≈ 0.618
  PHI_INV_SQUARED: (1 / PHI) ** 2, // ≈ 0.382

  // Default cron expression for heartbeat (runs every ~15min in practice)
  // Actual: 86 breaths × 22.5s = 32.4min per checkpoint
  // Simplified: run every 15 min for pragmatism
  CRON_EXPR: '*/15 * * * *',

  // Trigger keywords for different breath types
  TRIGGERS: {
    light: ['email', 'calendar', 'weather', 'quick'],
    deep: ['memory', 'audit', 'summary', 'review'],
    full: ['health', 'backup', 'clean', 'sweep']
  }
};

function calculateBreaths(durationMs) {
  const cycleMs = CONFIG.CYCLE_MS;
  return Math.floor(durationMs / cycleMs);
}

function nextCheckpointTime(lastCheckpointMs) {
  return lastCheckpointMs + CONFIG.CHECKPOINT_MS;
}

function getBreathType(breathCount) {
  // Every φ² breath: full audit
  if (breathCount % Math.round(CONFIG.PHI_SQUARED * 10) === 0) return 'full';
  // Every φ breath: deep check
  if (breathCount % Math.round(CONFIG.PHI * 10) === 0) return 'deep';
  return 'light';
}

module.exports = { CONFIG, calculateBreaths, nextCheckpointTime, getBreathType };
