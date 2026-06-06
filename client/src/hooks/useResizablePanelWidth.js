import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "stockjs-right-panel-width";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const MOBILE_BREAKPOINT = 1100;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStoredWidth() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? Number(stored) : DEFAULT_WIDTH;
    return Number.isFinite(parsed)
      ? clamp(parsed, MIN_WIDTH, MAX_WIDTH)
      : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

export default function useResizablePanelWidth() {
  const [width, setWidth] = useState(readStoredWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return undefined;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const onResizeStart = useCallback(
    (event) => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) return;

      event.preventDefault();
      setIsResizing(true);

      const startX = event.clientX;
      const startWidth = width;

      const onMove = (moveEvent) => {
        const delta = startX - moveEvent.clientX;
        setWidth(clamp(startWidth + delta, MIN_WIDTH, MAX_WIDTH));
      };

      const onUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        setWidth((current) => {
          try {
            localStorage.setItem(STORAGE_KEY, String(current));
          } catch {
            // ignore quota / private mode
          }
          return current;
        });
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width],
  );

  return { width, isResizing, onResizeStart };
}
