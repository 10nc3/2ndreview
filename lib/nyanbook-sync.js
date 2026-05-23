/**
 * DEPRECATED — Re-exported from lib/sync/workspace-sync.js
 * Use: require('./lib/sync/workspace-sync').logEvent / .flushEvents
 */
const ws = require('./sync/workspace-sync');
console.warn('[DEPRECATED] lib/nyanbook-sync.js → use lib/sync/workspace-sync.js');
module.exports = { log: ws.logEvent, flush: ws.flushEvents, getStatus: ws.getStatus };
