import { COMMITTEE_ENGINE_VERSION } from "./version";

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * The most recent stored snapshot from a *previous* day and the current
 * engine version — the baseline for "changed since last review". Returns
 * null when there's nothing comparable (thin history or engine changed).
 */
export function getPreviousSnapshot(history) {
  if (!Array.isArray(history) || !history.length) return null;
  const today = todayKey();
  // History is oldest → newest.
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i];
    if (
      row.day < today &&
      row.engineVersion === COMMITTEE_ENGINE_VERSION &&
      Number.isFinite(row.composite)
    ) {
      return row;
    }
  }
  return null;
}

/**
 * Compare today's verdict against the previous snapshot for UI chips.
 * Returns null when there's nothing to say (no baseline, or same tier).
 */
export function getTierChange(report, previousSnapshot) {
  if (!report?.verdict || !previousSnapshot) return null;
  if (previousSnapshot.tier === report.verdict.tier) return null;

  const TIER_RANK = {
    "Strong Buy": 4,
    Buy: 3,
    Hold: 2,
    Reduce: 1,
    Sell: 0,
  };
  const now = TIER_RANK[report.verdict.tier];
  const was = TIER_RANK[previousSnapshot.tier];
  if (!Number.isFinite(now) || !Number.isFinite(was)) return null;

  return {
    direction: now > was ? "upgrade" : "downgrade",
    fromTier: previousSnapshot.tier,
    fromComposite: previousSnapshot.composite,
    fromDay: previousSnapshot.day,
  };
}

/** Composite scores (current engine only) for a history sparkline. */
export function getScoreSeries(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (r) =>
        r.engineVersion === COMMITTEE_ENGINE_VERSION &&
        Number.isFinite(r.composite),
    )
    .map((r) => ({ day: r.day, composite: r.composite }));
}
