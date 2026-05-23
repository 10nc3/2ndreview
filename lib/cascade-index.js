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
// FIX #20: import the PDF cascade's getStatus so we can report real
// binary readiness instead of hardcoding `ready: true`.
const { parsePdfCascade, getStatus: getPdfStatus } = require('./pdf-cascade');
const { callWithCascade, selectTier, getStatus: getModelStatus } = require('./model-cascade');

async function search(query, opts = {}) {
  return searchCascade(query, opts);
}

async function pdf(input, opts = {}) {
  // (opts kept in the signature for forward compat — parsePdfCascade
  // currently only consumes `input`. See pdf-cascade.js notes.)
  return parsePdfCascade(input, opts);
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
    pdf: getPdfStatus(),                                          // FIX #20
  };
}

module.exports = { search, pdf, math, model, getStatus };
