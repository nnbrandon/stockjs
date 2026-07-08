import { useEffect, useState } from "react";

import { getStockDataBySymbol } from "../db";
import { seedSymbolData } from "../utils/addSymbolToWatchlist";
import { emitRefreshSignal } from "./useRefreshSignal";

// Guarantees a symbol's data cache exists before the detail page tries to
// read it. On a fresh phone browser opened from an email deep link, the
// candles/fundamentals/news for the symbol aren't in IndexedDB yet — this
// seeds them (WITHOUT adding the symbol to the watchlist) and reports a
// loading/error state so the page shows a spinner then content, or a clear
// "couldn't find data" message for a nonexistent-but-well-formed ticker.
//
// status: "idle" (no symbol) | "seeding" | "ready" | "error"
export default function useEnsureSymbolData(symbol) {
  const [state, setState] = useState({ status: "idle", error: "" });

  useEffect(() => {
    if (!symbol) {
      setState({ status: "idle", error: "" });
      return undefined;
    }

    let active = true;
    (async () => {
      try {
        const existing = await getStockDataBySymbol(symbol);
        if (!active) return;
        if (existing?.length) {
          setState({ status: "ready", error: "" });
          return;
        }
        setState({ status: "seeding", error: "" });
        await seedSymbolData(symbol);
        if (!active) return;
        // Wake useSymbolData / AnalystPanel so they re-read the now-seeded
        // data from IndexedDB.
        emitRefreshSignal(symbol);
        setState({ status: "ready", error: "" });
      } catch (err) {
        if (!active) return;
        setState({
          status: "error",
          error: err?.message || `Couldn't find data for ${symbol}`,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [symbol]);

  return state;
}
