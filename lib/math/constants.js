// lib/math/constants.js — Shared φ-family constants
// Single source of truth for PHI-derived math across nyanbook.

const PHI = 1.6180339887498949;
const PHI_SQUARED = PHI * PHI;
const PHI_INVERSE = 1 / PHI;
const PHI_INV_SQUARED = PHI_INVERSE ** 2;

module.exports = {
  PHI,
  PHI_SQUARED,
  PHI_INVERSE,
  PHI_INV_SQUARED
};
