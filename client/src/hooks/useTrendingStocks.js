import { useQuery } from "@tanstack/react-query";

import LambdaService from "../LambdaService";
import { trendingStocksQueryKey } from "../queryClient";
import getMarketSession from "../utils/marketSession";

export default function useTrendingStocks() {
  return useQuery({
    queryKey: trendingStocksQueryKey,
    queryFn: () => LambdaService.fetchTrending(),
    // Refetch on tab focus only while the market is live (pre/regular/post).
    // Evaluated per focus event, so it stays off overnight/weekends/holidays.
    refetchOnWindowFocus: () => getMarketSession() !== "closed",
  });
}
