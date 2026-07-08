// Session-wide cache of the server's committee state — ONE copy shared by
// the portfolio panel and the per-ticker AnalystPanel, so a run triggered
// from either surface updates both. (Both endpoints return rows for every
// holding, so any successful response is a full snapshot.) Cleared on page
// refresh; keyed by the sync email so switching accounts can't bleed rows.

let cacheEmail = null;
let rows = new Map();
let health = null;
let generatedAt = null;
let loaded = false;

function ensureEmail(email) {
  if (cacheEmail !== email) {
    cacheEmail = email;
    rows = new Map();
    health = null;
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
  if (data.generatedAt) generatedAt = data.generatedAt;
  loaded = true;
}

export function resetCommitteeCache() {
  cacheEmail = null;
  rows = new Map();
  health = null;
  generatedAt = null;
  loaded = false;
}
