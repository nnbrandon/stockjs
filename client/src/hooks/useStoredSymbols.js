import { useCallback, useEffect, useState } from "react";
import { getWatchlistWithNames } from "../db";

// The watchlist = explicit membership (getWatchlistWithNames), NOT every
// symbol with cached data. Browsing/deep-linking a ticker seeds its data
// without adding it here.
export default function useStoredSymbols() {
  const [storedSymbolsWithNames, setStoredSymbolsWithNames] = useState([]);

  const refresh = useCallback(async () => {
    const symbolsWithNames = await getWatchlistWithNames();
    setStoredSymbolsWithNames(symbolsWithNames);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { storedSymbolsWithNames, refresh };
}
