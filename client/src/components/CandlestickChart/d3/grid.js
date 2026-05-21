/**
 * Render (or re-render) the dashed background grid for the chart.
 *
 * Uses d3's enter/update/exit pattern via `.join()` so repeated calls during
 * zoom/pan reuse existing `<line>` nodes instead of churning the DOM by
 * removing and re-appending them every frame.
 *
 * The lines are appended to the chart's main group selection in the same
 * z-order they're added — call this BEFORE rendering candles/volume so the
 * grid sits behind the plotted data.
 */
export function renderGrid(parent, { xScale, yScale, width, height, colors }) {
  parent
    .selectAll("line.y-grid-line")
    .data(yScale.ticks())
    .join("line")
    .attr("class", "y-grid-line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", (tick) => yScale(tick))
    .attr("y2", (tick) => yScale(tick))
    .attr("stroke", colors.divider)
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2 4")
    .attr("opacity", 0.6);

  parent
    .selectAll("line.x-grid-line")
    .data(xScale.ticks())
    .join("line")
    .attr("class", "x-grid-line")
    .attr("x1", (tick) => xScale(tick))
    .attr("x2", (tick) => xScale(tick))
    .attr("y1", 0)
    .attr("y2", height)
    .attr("stroke", colors.divider)
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2 4")
    .attr("opacity", 0.4);
}
