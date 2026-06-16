import { useQuery } from "@tanstack/react-query";

import LambdaService from "../LambdaService";
import { addStockData, getLatestCandles } from "../db";
import { emitRefreshSignal } from "./useRefreshSignal";
import calculateRange, { rangeFromDate } from "../utils/calculateRange";
import useIsMarketOpen from "./useIsMarketOpen";

const SIX_MONTHS_DAYS = 180;

// Poll once a minute while the market is open. ~390 trading minutes/day ×
// ~21 trading days ≈ 8.2k Lambda calls per watched symbol per month — well
// under Lambda's always-free tier (1M requests + 400k GB-s per month).
const POLL_INTERVAL_MS = 60 * 1000;

export const liveStockDataQueryKey = (symbols) => [
  "live-stock-data",
  // Order-independent key so re-ordering the watchlist doesn't refetch.
  [...symbols].sort(),
];

/**
 * While the market is open, polls the last 6 months of price history for every
 * symbol on the watchlist, upserts it into IndexedDB, and signals subscribers
 * (chart, sidebar sparklines) to re-read. The "today" daily candle updates
 * live, so each poll refreshes the current price/high/low/volume without adding
 * rows (the `[symbol+shortenedDate]` key makes bulkPut an upsert).
 *
 * The query is disabled whenever the market is closed (or the watchlist is
 * empty), so it makes no Lambda calls outside trading hours. The market status
 * is reactive, so polling starts/stops automatically at the open/close.
 *
 * @param {string[]} symbols - Watchlist tickers to keep live.
 */
export default function useLiveStockData(symbols = []) {
  const marketOpen = useIsMarketOpen();

  return useQuery({
    queryKey: liveStockDataQueryKey(symbols),
    enabled: symbols.length > 0 && marketOpen,
    // Live data is never "fresh" — always allow the interval to refetch.
    staleTime: 0,
    refetchInterval: POLL_INTERVAL_MS,
    // Don't poll while the tab is hidden — saves calls when nobody's looking.
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // Fetch every watched symbol in parallel; a single failure shouldn't
      // block the rest of the watchlist from updating.
      const results = await Promise.allSettled(
        symbols.map(async (symbol) => {
          // Only pull candles since the last stored one — usually just today's
          // live candle (plus any sessions missed while closed), instead of
          // re-downloading 6 months of unchanged history every minute. Falls
          // back to a full seed if the symbol has no stored history yet.
          const [lastCandle] = await getLatestCandles(symbol, 1);
          const { startDate, endDate } = lastCandle
            ? rangeFromDate(lastCandle.shortenedDate)
            : calculateRange(SIX_MONTHS_DAYS);

          const historicalData = await LambdaService.fetchHistoricalData(
            symbol,
            startDate,
            endDate,
          );

          await addStockData(historicalData);
          // Wake useSymbolData (and any sidebar sparklines) to re-read fresh
          // data from IndexedDB for whatever range each is currently showing.
          emitRefreshSignal(symbol);

          return historicalData;
        }),
      );

      return results;
    },
  });
}
