import { useSyncExternalStore } from "react";

/**
 * A tiny module-scoped pub/sub for "this symbol's persisted data just
 * changed — anyone caching it should refetch". Uses React's
 * `useSyncExternalStore` so any number of components can subscribe per
 * symbol without prop drilling or React context.
 *
 * Producer side:  `emitRefreshSignal("AAPL")`
 * Consumer side:  const version = useRefreshSignal("AAPL");
 *                 // pass `version` into useEffect deps to trigger a refetch
 */

const listeners = new Set();
const versions = new Map();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Bump the version for `symbol`, causing every subscribed `useRefreshSignal`
 * instance for that symbol to re-render with the new number.
 */
export function emitRefreshSignal(symbol) {
  if (!symbol) return;
  versions.set(symbol, (versions.get(symbol) || 0) + 1);
  notify();
}

/**
 * Subscribe to refresh signals for a single symbol. Returns the current
 * version number — increments on every `emitRefreshSignal(symbol)` call.
 * Pair it with `useEffect` deps to re-run side effects when the signal fires.
 */
export function useRefreshSignal(symbol) {
  return useSyncExternalStore(
    subscribe,
    () => versions.get(symbol) || 0,
    () => 0,
  );
}
