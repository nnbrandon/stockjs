import { axisBottom, axisRight } from "d3-axis";

const AXIS_FONT_SIZE = "12px";

// Target horizontal space per x-axis label. Also capped by data density below
// so short ranges (e.g. 1M) don't get a tick every 2–3 sessions.
const X_AXIS_PX_PER_TICK = 140;

function resolveXTickCount(width, dataPointCount) {
  const byWidth = Math.max(2, Math.floor(width / X_AXIS_PX_PER_TICK));
  if (!dataPointCount || dataPointCount < 2) return byWidth;

  // At least ~5 sessions between labels when the series is dense.
  const byDensity = Math.max(2, Math.ceil(dataPointCount / 5));
  return Math.min(byWidth, byDensity);
}

/**
 * Create and render the bottom x-axis in a new `<g class="axis x-axis">`.
 * Returns the group selection and the axis generator (so the caller can
 * rebind a zoomed scale later via `axis.scale(xScaleZ)`).
 */
export function renderXAxis(parent, {
  xScale,
  height,
  width,
  tickFormat,
  dataPointCount,
}) {
  const tickCount = resolveXTickCount(width, dataPointCount);
  const axis = axisBottom(xScale).ticks(tickCount).tickFormat(tickFormat);
  const g = parent
    .append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(axis);
  return { g, axis };
}

/**
 * Create and render the right y-axis in a new `<g class="axis y-axis">`.
 */
export function renderYAxis(parent, { yScale, width }) {
  const axis = axisRight(yScale);
  const g = parent
    .append("g")
    .attr("class", "axis y-axis")
    .attr("transform", `translate(${width},0)`)
    .call(axis);
  return { g, axis };
}

/**
 * Apply our minimalist axis styling — hides the domain line + tick marks and
 * sets the tick label font/fill. Safe to call repeatedly (e.g. after every
 * zoom-driven axis re-render).
 *
 * @param {object} options
 * @param {boolean} [options.isVertical] - true for the right-hand y-axis
 *   (anchors labels to the start with a small `dx` so they sit inside the
 *   plot area instead of running off the right edge of the SVG).
 */
export function styleAxis(g, colors, { isVertical = false } = {}) {
  g.selectAll(".domain").attr("stroke", "none");
  g.selectAll("line").attr("stroke", "none");

  const text = g
    .selectAll("text")
    .attr("font-size", AXIS_FONT_SIZE)
    .attr("font-family", colors.fontMono)
    .attr("fill", colors.textDisabled);

  if (isVertical) {
    text.attr("text-anchor", "start").attr("dx", "8px");
  } else {
    // Force-clear any leftover transforms / styles from d3's default rendering.
    text
      .attr("transform", null)
      .style("transform", "none")
      .style("font-size", AXIS_FONT_SIZE);
  }
}
