import { drawPillLabel } from "./volume";

const LABEL_FONT_SIZE = "12px";

/**
 * Render a dashed horizontal line at the latest close price, plus a colored
 * pill label on the right edge showing the price. The line color matches the
 * candle direction (green if close ≥ open, red otherwise).
 *
 * Re-renders cleanly on every call — all previous nodes are removed first.
 */
export function renderLatestCloseLine(
  parent,
  datum,
  { width, height, yScale, colors },
) {
  parent.selectAll(".latest-close-line").remove();
  parent.selectAll(".latest-close-label").remove();
  parent.selectAll(".latest-close-label-bg").remove();

  if (!datum) return;

  const yPos = yScale(datum.close);
  if (yPos < 0 || yPos > height) return;

  const color = datum.open > datum.close ? colors.error : colors.success;

  parent
    .append("line")
    .attr("class", "latest-close-line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", yPos)
    .attr("y2", yPos)
    .attr("stroke", color)
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.6)
    .attr("stroke-dasharray", "3 3");

  drawPillLabel(parent, {
    x: width,
    y: yPos + 4,
    text: datum.close.toFixed(2),
    color,
    fontFamily: colors.fontMono,
    fontSize: LABEL_FONT_SIZE,
    bgFill: colors.bgElevated,
    labelClass: "latest-close-label",
    bgClass: "latest-close-label-bg",
  });
}
