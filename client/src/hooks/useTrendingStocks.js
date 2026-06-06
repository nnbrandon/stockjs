import { useQuery } from "@tanstack/react-query";

import LambdaService from "../LambdaService";
import { trendingStocksQueryKey } from "../queryClient";

export default function useTrendingStocks() {
  return useQuery({
    queryKey: trendingStocksQueryKey,
    queryFn: () => LambdaService.fetchTrending(),
  });
}
