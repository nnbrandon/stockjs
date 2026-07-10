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

/** Whole calendar days between two "YYYY-MM-DD" keys (0 if unparseable). */
function daySpan(fromDay, toDay) {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Plain-language read of a committee score series for the UI. Returns null
 * when there's nothing worth saying (fewer than two comparable points).
 */
export function summarizeScoreSeries(series) {
  if (!Array.isArray(series) || series.length < 2) return null;

  const first = series[0];
  const last = series[series.length - 1];
  const firstScore = Math.round(first.composite);
  const lastScore = Math.round(last.composite);
  const delta = lastScore - firstScore;

  const days = daySpan(first.day, last.day) || series.length - 1;
  const window = days === 1 ? "yesterday" : `the last ${days} days`;

  // Deepest dip / highest peak strictly between the endpoints.
  let low = last;
  let high = last;
  for (const p of series) {
    if (p.composite < low.composite) low = p;
    if (p.composite > high.composite) high = p;
  }
  const lowScore = Math.round(low.composite);
  const highScore = Math.round(high.composite);

  let direction;
  let text;
  if (Math.abs(delta) <= 1) {
    direction = "flat";
    text =
      days === 1
        ? `The committee score has held steady around ${lastScore} since yesterday.`
        : `The committee score has held steady around ${lastScore} over ${window}.`;
  } else if (delta > 0) {
    direction = "up";
    text = `The committee score has climbed ${delta} point${delta === 1 ? "" : "s"} over ${window}, from ${firstScore} to ${lastScore}.`;
    if (lowScore < firstScore && low.day !== first.day && low.day !== last.day) {
      text += ` It dipped to ${lowScore} on ${low.day} before recovering.`;
    }
  } else {
    direction = "down";
    const drop = -delta;
    text = `The committee score has slipped ${drop} point${drop === 1 ? "" : "s"} over ${window}, from ${firstScore} to ${lastScore}.`;
    if (highScore > firstScore && high.day !== first.day && high.day !== last.day) {
      text += ` It peaked at ${highScore} on ${high.day} before easing back.`;
    }
  }

  return { direction, delta, firstScore, lastScore, days, text };
}
