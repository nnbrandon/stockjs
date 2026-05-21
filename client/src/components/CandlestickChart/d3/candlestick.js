/**
 * Color for a single candle/stem based on open vs close.
 * Exported so the tooltip can match.
 */
export function candleColor(datum, colors) {
  if (datum.open === datum.close) return colors.textSecondary;
  return datum.open > datum.close ? colors.error : colors.success;
}

/**
 * Render candle bodies (rectangles spanning open → close).
 *
 * `bandwidth` is the visual width of each candle in px. On initial render
 * pass `xBand.bandwidth()`; on zoom pass `xBand.bandwidth() * transform.k`
 * so candles grow/shrink with the zoom level.
 *
 * Uses d3's enter/update/exit `.join()` so repeated calls reuse the same
 * `<rect>` nodes — safe to invoke on every zoom frame.
 */
export function renderCandles(
  parent,
  data,
  { xScale, bandwidth, yScale, colors },
) {
  return parent
    .selectAll("rect.candle")
    .data(data)
    .join("rect")
    .attr("class", "candle")
    .attr("x", (_, i) => xScale(i) - bandwidth / 2)
    .attr("width", bandwidth)
    .attr("y", (d) => yScale(Math.max(d.open, d.close)))
    .attr("height", (d) =>
      d.open === d.close
        ? 1
        : yScale(Math.min(d.open, d.close)) - yScale(Math.max(d.open, d.close)),
    )
    .attr("rx", 1)
    .attr("fill", (d) => candleColor(d, colors));
}

/**
 * Render candle stems (thin vertical lines from low to high). Stems are
 * always 1px wide and centered on the tick, regardless of zoom level.
 */
export function renderStems(parent, data, { xScale, yScale, colors }) {
  return parent
    .selectAll("line.stem")
    .data(data)
    .join("line")
    .attr("class", "stem")
    .attr("x1", (_, i) => xScale(i))
    .attr("x2", (_, i) => xScale(i))
    .attr("y1", (d) => yScale(d.high))
    .attr("y2", (d) => yScale(d.low))
    .attr("stroke", (d) => candleColor(d, colors));
}
