// Tracks the last calendar day we ran an automatic "refresh all", so the app
// refreshes once on the first open of each day and not on every reload.

const STORAGE_KEY = "lastRefreshAllDate";

// Local-day key (YYYY-MM-DD). Uses the user's own timezone so "today" matches
// what they'd expect, regardless of where the market is.
function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True if we haven't yet auto-refreshed today (or storage is unavailable). */
export function shouldAutoRefreshToday() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== todayKey();
  } catch {
    // Private mode / disabled storage — skip the auto-refresh rather than loop.
    return false;
  }
}

/** Record that today's auto-refresh has run. */
export function markAutoRefreshedToday() {
  try {
    localStorage.setItem(STORAGE_KEY, todayKey());
  } catch {
    // Ignore — worst case we auto-refresh again on the next open.
  }
}
