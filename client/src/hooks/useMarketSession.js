import { useEffect, useState } from "react";

import getMarketSession from "../utils/marketSession";

// How often to re-check the clock. Cheap, local-only computation (no network),
// so this just controls how quickly we react to the session boundaries.
const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Reactive wrapper around `getMarketSession()`. Returns 'pre' | 'regular' |
 * 'post' | 'closed', flipping at the session boundaries so subscribers
 * (e.g. the extended-hours poll) start/stop automatically.
 */
export default function useMarketSession() {
  const [session, setSession] = useState(getMarketSession);

  useEffect(() => {
    const tick = () => setSession(getMarketSession());
    tick();
    const id = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return session;
}
