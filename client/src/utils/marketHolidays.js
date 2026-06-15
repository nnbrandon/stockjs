// NYSE/Nasdaq holiday calendar.
//
// Hand-maintained from the exchange's published schedule. A static table (vs.
// computing holidays from rules) is deliberate: it also captures ad-hoc
// closures the rules can't predict (e.g. national days of mourning), and it's
// auditable. Downside: add the next year's dates once a year — see TODO below.
//
// All keys are NY-local calendar dates (YYYY-MM-DD).

// Full-day market closures.
const FULL_CLOSURES = {
  2025: [
    "2025-01-01", // New Year's Day
    "2025-01-20", // Martin Luther King Jr. Day
    "2025-02-17", // Presidents' Day
    "2025-04-18", // Good Friday
    "2025-05-26", // Memorial Day
    "2025-06-19", // Juneteenth
    "2025-07-04", // Independence Day
    "2025-09-01", // Labor Day
    "2025-11-27", // Thanksgiving
    "2025-12-25", // Christmas
  ],
  2026: [
    "2026-01-01", // New Year's Day
    "2026-01-19", // Martin Luther King Jr. Day
    "2026-02-16", // Presidents' Day
    "2026-04-03", // Good Friday
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-03", // Independence Day (observed; Jul 4 is a Saturday)
    "2026-09-07", // Labor Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
  ],
  2027: [
    "2027-01-01", // New Year's Day
    "2027-01-18", // Martin Luther King Jr. Day
    "2027-02-15", // Presidents' Day
    "2027-03-26", // Good Friday
    "2027-05-31", // Memorial Day
    "2027-06-18", // Juneteenth (observed; Jun 19 is a Saturday)
    "2027-07-05", // Independence Day (observed; Jul 4 is a Sunday)
    "2027-09-06", // Labor Day
    "2027-11-25", // Thanksgiving
    "2027-12-24", // Christmas (observed; Dec 25 is a Saturday)
  ],
};

// Early-close days — the market opens normally but closes at 1:00 PM ET.
const EARLY_CLOSES = {
  2025: [
    "2025-07-03", // Day before Independence Day
    "2025-11-28", // Day after Thanksgiving
    "2025-12-24", // Christmas Eve
  ],
  2026: [
    "2026-11-27", // Day after Thanksgiving
    "2026-12-24", // Christmas Eve
  ],
  2027: [
    "2027-11-26", // Day after Thanksgiving
  ],
};

// TODO: append the next year's dates here each year (NYSE publishes them in
// advance). Until then, dates past MAX_COVERED_YEAR fall back to a normal
// trading day — see isMarketOpen's stale-calendar warning.

export const MARKET_OPEN_MINUTE = 9 * 60 + 30; // 9:30 AM ET
export const REGULAR_CLOSE_MINUTE = 16 * 60; // 4:00 PM ET
export const EARLY_CLOSE_MINUTE = 13 * 60; // 1:00 PM ET

const fullClosureSet = new Set(Object.values(FULL_CLOSURES).flat());
const earlyCloseSet = new Set(Object.values(EARLY_CLOSES).flat());

export const MAX_COVERED_YEAR = Math.max(
  ...Object.keys(FULL_CLOSURES).map(Number),
);

/** True if `nyDateKey` (YYYY-MM-DD, NY-local) is a full market closure. */
export function isFullClosure(nyDateKey) {
  return fullClosureSet.has(nyDateKey);
}

/** Minute-of-day the market closes on `nyDateKey` (handles 1 PM early closes). */
export function marketCloseMinute(nyDateKey) {
  return earlyCloseSet.has(nyDateKey)
    ? EARLY_CLOSE_MINUTE
    : REGULAR_CLOSE_MINUTE;
}
