import {
  isFullClosure,
  marketCloseMinute,
  MARKET_OPEN_MINUTE,
} from "./marketHolidays";

const PRE_MARKET_OPEN_MINUTE = 4 * 60; // 4:00 AM ET
const POST_MARKET_CLOSE_MINUTE = 20 * 60; // 8:00 PM ET

/**
 * Which trading session New York is in right now:
 *   'pre'     — 4:00 AM ET to the open
 *   'regular' — 9:30 AM ET to the close (4:00 PM, or 1:00 PM on early-close days)
 *   'post'    — the close to 8:00 PM ET
 *   'closed'  — weekends, holidays, and overnight
 *
 * (On early-close days post-market really ends ~5:00 PM, but 8:00 PM is a safe
 * upper bound — at worst we poll a stale quote, never miss a live one.)
 */
export default function getMarketSession() {
  const now = new Date();
  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );

  const day = nyNow.getDay();
  if (day === 0 || day === 6) return "closed";

  const dateKey = `${nyNow.getFullYear()}-${String(nyNow.getMonth() + 1).padStart(2, "0")}-${String(
    nyNow.getDate(),
  ).padStart(2, "0")}`;
  if (isFullClosure(dateKey)) return "closed";

  const minutes = nyNow.getHours() * 60 + nyNow.getMinutes();
  const close = marketCloseMinute(dateKey);

  if (minutes >= MARKET_OPEN_MINUTE && minutes < close) return "regular";
  if (minutes >= PRE_MARKET_OPEN_MINUTE && minutes < MARKET_OPEN_MINUTE)
    return "pre";
  if (minutes >= close && minutes < POST_MARKET_CLOSE_MINUTE) return "post";
  return "closed";
}

export function isExtendedHours(session = getMarketSession()) {
  return session === "pre" || session === "post";
}

export function marketSessionLabel(session = getMarketSession()) {
  switch (session) {
    case "regular":
      return "LIVE";
    case "pre":
      return "PRE-MARKET";
    case "post":
      return "AFTER HOURS";
    default:
      return "CLOSED";
  }
}
