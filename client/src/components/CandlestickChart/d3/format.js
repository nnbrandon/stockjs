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

function spanDaysBetween(dates) {
  if (!dates?.length || dates.length < 2) return 0;
  return (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
}

/**
 * Format a Date for the x-axis. Shorter strings when the visible range is
 * narrow so labels don't collide (e.g. "May 8" for 1M, "Jan 5 '26" for 1Y).
 */
export function formatDateLabel(date, { spanDays } = {}) {
  if (!date) return "";
  const month = MONTHS[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  if (spanDays > 0 && spanDays <= 120) {
    return `${month} ${day}`;
  }
  if (spanDays > 0 && spanDays <= 400) {
    return `${month} ${day} '${String(year).slice(2)}`;
  }
  return `${month} ${day} ${year}`;
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
  const spanDays = spanDaysBetween(dates);

  return function tickFormatter(domainValue) {
    const value = domainValue.valueOf();
    if (!Number.isInteger(value)) return "";
    if (value < 0 || value >= dates.length) return "";
    return formatDateLabel(dates[value], { spanDays });
  };
}
