const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Format a Date object as "MMM D YYYY" (e.g. "Jan 5 2026").
 */
export function formatDateLabel(date) {
  if (!date) return "";
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

/**
 * Compact number formatter (1.23K / 4.56M / 7.89B).
 */
export function formatShortNumber(num) {
  if (num == null || !Number.isFinite(num)) return "";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
  return num.toString();
}

/**
 * Factory: given the chart's `dates` array, return an axis tickFormatter that
 * maps a tick index to a formatted date string.
 *
 * Returns an empty string for non-integer ticks. d3-axis sizes its tick count
 * by pixel width, so when the chart is wide but only has a handful of candles
 * (e.g. the "1W" timeframe), it generates extra ticks at fractional indices
 * like 0.5, 1.5, etc. Without this guard, `Math.floor` would resolve both
 * `0` and `0.5` to `dates[0]` and we'd render duplicate labels.
 */
export function makeDateTickFormatter(dates) {
  return function tickFormatter(domainValue) {
    const value = domainValue.valueOf();
    if (!Number.isInteger(value)) return "";
    if (value < 0 || value >= dates.length) return "";
    return formatDateLabel(dates[value]);
  };
}
