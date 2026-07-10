// Session-wide cache of the server's committee state — ONE copy shared by
// the portfolio panel and the per-ticker AnalystPanel, so a run triggered
// from either surface updates both. (Both endpoints return rows for every
// holding, so any successful response is a full snapshot.) Cleared on page
// refresh; keyed by the sync email so switching accounts can't bleed rows.

let cacheEmail = null;
let rows = new Map();
let health = null;
let trackRecord = null;
let generatedAt = null;
let loaded = false;

// Both panels stay mounted across navigation (the portfolio provider lives
// at App level), so cache writes must notify them — without this, a run
// triggered from one surface leaves the other rendering its stale copy.
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

/** Subscribe to cache changes; returns the unsubscribe function. */
export function subscribeCommitteeCache(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensureEmail(email) {
  if (cacheEmail !== email) {
    cacheEmail = email;
    rows = new Map();
    health = null;
    trackRecord = null;
    generatedAt = null;
    loaded = false;
  }
}

/** True once committeeResults/runCommittee has succeeded for this email. */
export function isCommitteeCacheLoaded(email) {
  return cacheEmail === email && loaded;
}

export function getCommitteeRow(email, symbol) {
  return cacheEmail === email ? (rows.get(symbol) ?? null) : null;
}

export function getCommitteeHealth(email) {
  return cacheEmail === email ? health : null;
}

export function getCommitteeTrackRecord(email) {
  return cacheEmail === email ? trackRecord : null;
}

export function getCommitteeGeneratedAt(email) {
  return cacheEmail === email ? generatedAt : null;
}

/** Merge a committeeResults/runCommittee response into the cache. */
export function storeCommitteeResponse(email, data) {
  ensureEmail(email);
  for (const row of data.results ?? []) {
    if (row?.symbol) rows.set(row.symbol, row);
  }
  if (data.health != null) health = data.health;
  if (data.trackRecord !== undefined) trackRecord = data.trackRecord;
  if (data.generatedAt) generatedAt = data.generatedAt;
  loaded = true;
  notify();
}

export function resetCommitteeCache() {
  cacheEmail = null;
  rows = new Map();
  health = null;
  trackRecord = null;
  generatedAt = null;
  loaded = false;
  notify();
}
