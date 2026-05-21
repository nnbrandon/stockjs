import { max } from "d3-array";
import { scaleLinear } from "d3-scale";
import { formatShortNumber } from "./format";

const VOLUME_AREA_FRACTION = 0.2;
const LABEL_FONT_SIZE = "11px";

/**
 * Volume area occupies the bottom 20% of the chart.
 */
export function getVolumeLayout(height) {
  const volumeHeight = height * VOLUME_AREA_FRACTION;
  const volumeY = height - volumeHeight;
  return { volumeHeight, volumeY };
}

/**
 * Build a linear scale for volume that maps 0 → bottom of volume area,
 * max(volume) → top of volume area.
 */
export function buildVolumeScale(data, volumeHeight) {
  return scaleLinear()
    .domain([0, max(data, (d) => d.volume) ?? 0])
    .range([volumeHeight, 0]);
}

/**
 * Render the volume bars inside a dedicated `<g class="volume-bars">` group.
 * The group is created lazily on first call and reused on subsequent calls.
 *
 * Bandwidth scales with zoom (`xBand.bandwidth() * transform.k`).
 */
export function renderVolumeBars(
  parent,
  data,
  { xScale, bandwidth, volumeScale, volumeHeight, volumeY, colors },
) {
  let g = parent.select("g.volume-bars");
  if (g.empty()) {
    g = parent
      .append("g")
      .attr("class", "volume-bars")
      .attr("transform", `translate(0,${volumeY})`)
      .attr("clip-path", "url(#clip)");
  }

  return g
    .selectAll("rect.volume-bar")
    .data(data)
    .join("rect")
    .attr("class", "volume-bar")
    .attr("x", (_, i) => xScale(i) - bandwidth / 2)
    .attr("width", bandwidth)
    .attr("y", (d) => volumeScale(d.volume))
    .attr("height", (d) => volumeHeight - volumeScale(d.volume))
    .attr("fill", (d) => (d.open > d.close ? colors.error : colors.success))
    .attr("opacity", 0.2);
}

/**
 * Render the rightmost-volume indicator: a colored circle on the right edge,
 * plus a pill-shaped label showing the formatted volume.
 *
 * On every call the previous indicator nodes are cleared and re-drawn — the
 * label width depends on a measured bbox so this is simpler than a true data
 * join. (See drawPillLabel for the shared label-with-bg primitive.)
 */
export function renderVolumeIndicator(
  parent,
  data,
  { width, volumeScale, volumeY, volumeHeight, colors },
) {
  parent.selectAll(".volume-indicator").remove();
  parent.selectAll(".volume-indicator-label").remove();
  parent.selectAll(".volume-indicator-bg").remove();

  if (!data.length) return;

  const lastDatum = data[data.length - 1];
  const yPos = volumeY + volumeScale(lastDatum.volume);
  if (yPos < volumeY || yPos > volumeY + volumeHeight) return;

  const color =
    lastDatum.open > lastDatum.close ? colors.error : colors.success;

  parent
    .append("circle")
    .attr("class", "volume-indicator")
    .attr("cx", width)
    .attr("cy", yPos)
    .attr("r", 5)
    .attr("fill", color)
    .attr("stroke", colors.bgPaper)
    .attr("stroke-width", 2);

  drawPillLabel(parent, {
    x: width + 10,
    y: yPos + 4,
    text: formatShortNumber(lastDatum.volume),
    color,
    fontFamily: colors.fontMono,
    fontSize: LABEL_FONT_SIZE,
    bgFill: colors.bgElevated,
    labelClass: "volume-indicator-label",
    bgClass: "volume-indicator-bg",
  });
}

/**
 * Append a text label with a rounded background "pill" sized to fit the text.
 * Shared by the volume indicator and the latest-close-line label.
 */
export function drawPillLabel(
  parent,
  { x, y, text, color, fontFamily, fontSize, bgFill, labelClass, bgClass },
) {
  // Append, measure, remove — needed because the bg rect must wrap the text bbox.
  const tempText = parent
    .append("text")
    .attr("x", x)
    .attr("y", y)
    .attr("font-size", fontSize)
    .attr("font-family", fontFamily)
    .text(text);
  const bbox = tempText.node().getBBox();
  tempText.remove();

  parent
    .append("rect")
    .attr("class", bgClass)
    .attr("x", bbox.x - 6)
    .attr("y", bbox.y - 2)
    .attr("width", bbox.width + 12)
    .attr("height", bbox.height + 4)
    .attr("rx", 4)
    .attr("fill", bgFill)
    .attr("opacity", 0.95);

  parent
    .append("text")
    .attr("class", labelClass)
    .attr("x", x)
    .attr("y", y)
    .attr("fill", color)
    .attr("font-size", fontSize)
    .attr("font-family", fontFamily)
    .attr("text-anchor", "start")
    .text(text);
}
