import { QueryClient } from "@tanstack/react-query";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const trendingStocksQueryKey = ["trending-stocks"];

export const symbolSearchQueryKey = (query) => ["symbol-search", query];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: SIX_HOURS_MS,
      gcTime: SIX_HOURS_MS,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
