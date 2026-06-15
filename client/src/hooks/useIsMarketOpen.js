import { useEffect, useState } from "react";

import isMarketOpen from "../utils/isMarketOpen";

// How often to re-check the clock. Cheap, local-only computation (no network),
// so this just controls how quickly we react to the 9:30/16:00 ET boundaries.
const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Reactive wrapper around `isMarketOpen()`. Returns a boolean that flips when
 * the market opens or closes, re-rendering subscribers so things like
 * `useQuery({ enabled })` start/stop at the market boundaries — `isMarketOpen()`
 * on its own is evaluated only at render time and would never update mid-session.
 */
export default function useIsMarketOpen() {
  const [open, setOpen] = useState(isMarketOpen);

  useEffect(() => {
    const tick = () => setOpen(isMarketOpen());
    tick(); // sync immediately on mount in case time passed before subscribing
    const id = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return open;
}
