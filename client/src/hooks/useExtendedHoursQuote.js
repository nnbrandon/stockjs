import { useQuery } from "@tanstack/react-query";

import LambdaService from "../LambdaService";
import useMarketSession from "./useMarketSession";
import { isExtendedHours } from "../utils/marketSession";

// Poll once a minute during extended hours. This window (pre + post) is
// mutually exclusive with the regular-session daily-candle poll, so it never
// runs at the same time as useLiveStockData.
const POLL_INTERVAL_MS = 60 * 1000;

export const extendedHoursQueryKey = (symbols) => [
  "extended-hours-quotes",
  [...symbols].sort(),
];

/**
 * Active pre/post-market quote for `symbol`, or null when no extended session
 * is running / there's no extended price.
 *
 * No context/provider needed: every caller that passes the same `symbols` list
 * shares one React Query cache entry, so React Query dedupes them into a single
 * poll. Pass the set you want covered — e.g. the holdings shown in a table, or
 * just `[symbol]` for a single header. The query is disabled (no network)
 * outside extended hours and when the tab is hidden.
 *
 * @param {string} symbol   the row/header symbol to read
 * @param {string[]} symbols the batch to fetch (shared cache key)
 */
export default function useExtendedHoursQuote(symbol, symbols = []) {
  const session = useMarketSession();
  const extended = isExtendedHours(session);

  const { data } = useQuery({
    queryKey: extendedHoursQueryKey(symbols),
    enabled: extended && symbols.length > 0,
    staleTime: 0,
    refetchInterval: POLL_INTERVAL_MS,
    // Don't poll while the tab is hidden — saves calls when nobody's looking.
    refetchIntervalInBackground: false,
    // Refetch on tab focus for an immediate fresh quote; gated by `enabled`, so
    // it only fires during extended (pre/post) hours.
    refetchOnWindowFocus: true,
    queryFn: () => LambdaService.fetchQuotes(symbols),
  });

  if (!symbol || !data) return null;
  const quote = data.find((q) => q.symbol === symbol);
  if (!quote) return null;

  if (session === "pre" && Number.isFinite(quote.preMarketPrice)) {
    return {
      session: "pre",
      label: "Pre-market",
      price: quote.preMarketPrice,
      change: quote.preMarketChange,
      changePercent: quote.preMarketChangePercent,
    };
  }
  if (session === "post" && Number.isFinite(quote.postMarketPrice)) {
    return {
      session: "post",
      label: "After hours",
      price: quote.postMarketPrice,
      change: quote.postMarketChange,
      changePercent: quote.postMarketChangePercent,
    };
  }
  return null;
}
