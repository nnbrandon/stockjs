import { useEffect } from "react";
import { debounce } from "lodash";

/**
 * Re-run `onResize` when `targetRef`'s layout box changes (sidebar toggle,
 * panel drag, window resize, etc.).
 */
export default function useResizeObserver(targetRef, onResize, deps = []) {
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;

    const handler = debounce(onResize, 150);
    handler();

    const observer = new ResizeObserver(() => handler());
    observer.observe(target);

    return () => {
      observer.disconnect();
      handler.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
