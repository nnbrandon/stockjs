import { useCallback, useEffect, useState } from "react";
import { getStoredSymbolsWithNames } from "../db";

export default function useStoredSymbols() {
  const [storedSymbolsWithNames, setStoredSymbolsWithNames] = useState([]);

  const refresh = useCallback(async () => {
    const symbolsWithNames = await getStoredSymbolsWithNames();
    setStoredSymbolsWithNames(symbolsWithNames);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { storedSymbolsWithNames, refresh };
}
