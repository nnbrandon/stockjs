import {
  isFullClosure,
  marketCloseMinute,
  MARKET_OPEN_MINUTE,
  MAX_COVERED_YEAR,
} from "./marketHolidays";

let warnedStaleCalendar = false;

export default function isMarketOpen() {
  const now = new Date();

  // Get the current date/time as it appears in New York (handles DST automatically).
  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );

  const day = nyNow.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  // NY-local calendar date, e.g. "2026-06-15".
  const year = nyNow.getFullYear();
  const dateKey = `${year}-${String(nyNow.getMonth() + 1).padStart(2, "0")}-${String(
    nyNow.getDate(),
  ).padStart(2, "0")}`;

  // Past the maintained holiday table: warn once and fall back to treating it
  // as a normal trading day rather than guessing.
  if (year > MAX_COVERED_YEAR && !warnedStaleCalendar) {
    warnedStaleCalendar = true;
    console.warn(
      `Market holiday calendar only covers through ${MAX_COVERED_YEAR}; ` +
        `add ${year}'s dates to marketHolidays.js. Treating holidays as open days until then.`,
    );
  }

  // Full closure (holiday) — closed regardless of the time.
  if (isFullClosure(dateKey)) return false;

  const totalMinutes = nyNow.getHours() * 60 + nyNow.getMinutes();

  // Regular hours are 9:30 AM – 4:00 PM ET; early-close days end at 1:00 PM ET.
  return (
    totalMinutes >= MARKET_OPEN_MINUTE &&
    totalMinutes < marketCloseMinute(dateKey)
  );
}
