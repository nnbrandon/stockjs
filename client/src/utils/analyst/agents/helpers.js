export const bull = (text, weight = 1) => ({ text, polarity: "bull", weight });
export const bear = (text, weight = 1) => ({ text, polarity: "bear", weight });
export const neutral = (text, weight = 1) => ({
  text,
  polarity: "neutral",
  weight,
});

export const pct = (n, d = 1) => (Number.isFinite(n) ? `${n.toFixed(d)}%` : "n/a");

export const sortByDateDesc = (rows = []) =>
  [...rows].sort((a, b) => new Date(b.date) - new Date(a.date));

// Find the row ~1 year before `latest` by date, not by position. The quarterly
// series can have gaps (a missing quarter, or earnings-only rows merged in), so
// indexing `rows[4]` isn't reliably "same quarter last year". Returns the row
// whose date is closest to 365 days earlier, within a ±45-day tolerance, or
// null if nothing lands in that window.
export function findYearAgoRow(rows = [], latest) {
  const latestTime = latest?.date ? new Date(latest.date).getTime() : NaN;
  if (!Number.isFinite(latestTime)) return null;

  const targetTime = latestTime - 365 * 24 * 60 * 60 * 1000;
  const TOLERANCE_MS = 45 * 24 * 60 * 60 * 1000;

  let best = null;
  let bestDiff = Infinity;
  for (const row of rows) {
    const t = new Date(row.date).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }
  return bestDiff <= TOLERANCE_MS ? best : null;
}

export function avg(nums) {
  const valid = nums.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

export function stanceFromScore(score) {
  if (!Number.isFinite(score)) return "No data";
  if (score >= 64) return "Positive";
  if (score >= 40) return "Neutral";
  return "Negative";
}

export function labelScore(score) {
  if (!Number.isFinite(score)) return "unavailable";
  if (score >= 70) return "strong";
  if (score >= 55) return "good";
  if (score >= 45) return "mixed";
  if (score >= 30) return "weak";
  return "poor";
}

export function truncate(text = "", max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
