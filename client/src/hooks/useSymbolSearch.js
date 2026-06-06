import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import LambdaService from "../LambdaService";
import { symbolSearchQueryKey } from "../queryClient";

const DEBOUNCE_MS = 300;

export default function useSymbolSearch(inputQuery) {
  const trimmed = inputQuery.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!trimmed) {
      setDebouncedQuery("");
      return undefined;
    }

    const timer = setTimeout(() => setDebouncedQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const { data, isFetching } = useQuery({
    queryKey: symbolSearchQueryKey(debouncedQuery),
    queryFn: () => LambdaService.searchSymbols(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  const isSearching =
    trimmed.length > 0 && (trimmed !== debouncedQuery || isFetching);

  return {
    results: data ?? [],
    isSearching,
  };
}
