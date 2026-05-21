import { axisBottom, axisRight } from "d3-axis";

const AXIS_FONT_SIZE = "12px";

// One x-axis label per ~110 px of chart width. Prevents d3-axis from
// generating fractional-index ticks (and duplicate labels) on wide charts
// with few candles, and keeps labels from overlapping on narrow ones.
const X_AXIS_PX_PER_TICK = 110;

/**
 * Create and render the bottom x-axis in a new `<g class="axis x-axis">`.
 * Returns the group selection and the axis generator (so the caller can
 * rebind a zoomed scale later via `axis.scale(xScaleZ)`).
 */
export function renderXAxis(parent, { xScale, height, width, tickFormat }) {
  const tickCount = Math.max(2, Math.floor(width / X_AXIS_PX_PER_TICK));
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
