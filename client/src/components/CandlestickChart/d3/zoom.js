import { zoom, zoomTransform } from "d3-zoom";

/**
 * Attach a d3-zoom behavior bound to the given selection. Pan/zoom is clamped
 * to the chart's bounding box.
 *
 * `onZoom` fires on every zoom event (continuous, during drag);
 * `onZoomEnd` fires when the user releases / wheel inertia settles — use it
 * for expensive work like transitioning the y-domain.
 */
export function attachZoom(
  target,
  { width, height, onZoom, onZoomEnd, scaleExtent = [1, 100] },
) {
  const behavior = zoom()
    .scaleExtent(scaleExtent)
    .translateExtent([
      [0, 0],
      [width, height],
    ])
    .extent([
      [0, 0],
      [width, height],
    ])
    .on("zoom", onZoom)
    .on("zoom.end", onZoomEnd);

  target.call(behavior);
  return behavior;
}

/**
 * Read the current zoom transform applied to a node. Re-exported from d3-zoom
 * so callers don't need to depend on d3-zoom directly.
 */
export function getZoomTransform(node) {
  return zoomTransform(node);
}
