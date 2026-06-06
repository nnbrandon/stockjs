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
