import { getLatestCandles } from "../db";
import { rangeFromDate } from "./calculateRange";

/**
 * Price-history range covering only the candles at/after the last one already
 * stored for `symbol` — usually just today's in-progress candle, plus any
 * sessions missed while the app was closed. Used by the live poll and the
 * refresh flows so they top up recent prices instead of re-downloading months
 * (or years) of unchanged history.
 *
 * Falls back to `seedRange` when the symbol has no stored candles yet. In
 * practice that only happens for a watchlist entry that was never seeded, since
 * adding a ticker fetches full history up front (see addSymbolToWatchlist).
 */
export default async function priceRangeSinceLastCandle(symbol, seedRange) {
  const [lastCandle] = await getLatestCandles(symbol, 1);
  return lastCandle ? rangeFromDate(lastCandle.shortenedDate) : seedRange;
}
