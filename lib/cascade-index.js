/**
 * lib/cascade-index.js — Unified cascade entry point
 * Graceful degradation for: search, math, models, PDFs
 *
 * Usage:
 *   const cascades = require('./lib/cascade-index');
 *   const { results, source, tier, lossy } = await cascades.search(query);
 *   const { text, tier } = await cascades.pdf(filePath);
 *   const { result, tier } = await cascades.math(expression, opts);
 *   const { _provenance } = await cascades.model(invokeFn, opts);
 */

const { searchCascade, getStatus: getSearchStatus } = require('./search-cascade');
const { mathCascade, getStatus: getMathStatus } = require('./math-cascade');
const { parsePdfCascade } = require('./pdf-cascade');
const { callWithCascade, selectTier, getStatus: getModelStatus } = require('./model-cascade');

async function search(query, opts = {}) {
  return searchCascade(query, opts);
}

async function pdf(input, opts = {}) {
  return parsePdfCascade(input);
}

async function math(expression, opts = {}) {
  return mathCascade(expression, opts);
}

async function model(invokeFn, opts = {}) {
  return callWithCascade(invokeFn, opts);
}

function getStatus() {
  return {
    search: getSearchStatus(),
    math: getMathStatus(),
    model: getModelStatus(),
    pdf: { tiers: ['pdftotext', 'nano-pdf', 'heuristic'], ready: true }
  };
}

module.exports = { search, pdf, math, model, getStatus };
