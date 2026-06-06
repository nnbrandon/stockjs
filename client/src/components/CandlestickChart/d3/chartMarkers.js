import { select } from "d3-selection";
import { matchEarningsToChart } from "./earningsMarkers.js";

export { matchEarningsToChart };

const BADGE_SIZE = 17;
const PENTAGON_W = BADGE_SIZE;
const PENTAGON_H = BADGE_SIZE;
const CIRCLE_R = BADGE_SIZE / 2;
const BADGE_GAP = 2;

const MARKER_STYLES = {
  earnings: (colors) => ({
    shape: "pentagon",
    stroke: colors.success,
    fill: colors.bgPaper,
    label: "E",
    labelFill: colors.success,
    fontSize: 10,
  }),
  bullishEngulfing: (colors) => ({
    shape: "circle",
    stroke: colors.success,
    fill: colors.bgPaper,
    label: "B",
    arrow: "↑",
    labelFill: colors.success,
    fontSize: 10,
    arrowSize: 8.5,
  }),
  bearishEngulfing: (colors) => ({
    shape: "circle",
    stroke: colors.error,
    fill: colors.bgPaper,
    label: "B",
    arrow: "↓",
    labelFill: colors.error,
    fontSize: 10,
    arrowSize: 8.5,
  }),
};

function pentagonPath() {
  const hw = PENTAGON_W / 2;
  const peak = -PENTAGON_H;
  const shoulder = -PENTAGON_H * 0.38;
  return [
    `M 0,${peak}`,
    `L ${hw},${shoulder}`,
    `L ${hw},0`,
    `L ${-hw},0`,
    `L ${-hw},${shoulder}`,
    "Z",
  ].join(" ");
}

const STACK_ORDER = {
  earnings: 0,
  bullishEngulfing: 1,
  bearishEngulfing: 2,
};

export function buildMarkerStacks({
  earningsMarkers = [],
  bullishIndices = [],
  bearishIndices = [],
  visibility = {},
}) {
  const byIndex = new Map();

  const add = (index, marker) => {
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(marker);
  };

  if (visibility.earnings !== false) {
    for (const m of earningsMarkers) {
      add(m.index, { type: "earnings", earning: m.earning });
    }
  }
  if (visibility.bullishEngulfing) {
    for (const index of bullishIndices) {
      add(index, { type: "bullishEngulfing" });
    }
  }
  if (visibility.bearishEngulfing) {
    for (const index of bearishIndices) {
      add(index, { type: "bearishEngulfing" });
    }
  }

  const flat = [];
  for (const [index, markers] of byIndex) {
    markers.sort((a, b) => STACK_ORDER[a.type] - STACK_ORDER[b.type]);
    markers.forEach((marker, stackPos) => {
      flat.push({
        key:
          marker.type === "earnings"
            ? `earnings-${index}-${marker.earning.date}-${marker.earning.reportedDate}`
            : `${marker.type}-${index}`,
        index,
        marker,
        stackPos,
      });
    });
  }

  return flat;
}

function applyMarkerStyle(g, d, colors) {
  const style = MARKER_STYLES[d.marker.type](colors);
  const isCircle = style.shape === "circle";

  g.select(".chart-marker-pentagon")
    .attr("display", isCircle ? "none" : null)
    .attr("fill", style.fill)
    .attr("stroke", style.stroke);

  g.select(".chart-marker-circle")
    .attr("display", isCircle ? null : "none")
    .attr("fill", style.fill)
    .attr("stroke", style.stroke);

  g.select(".chart-marker-letter")
    .attr("display", isCircle ? null : "none")
    .attr("fill", style.labelFill)
    .attr("font-size", `${style.fontSize}px`)
    .text(style.label);

  g.select(".chart-marker-arrow")
    .attr("display", isCircle ? null : "none")
    .attr("fill", style.labelFill)
    .attr("font-size", `${style.arrowSize ?? style.fontSize - 1}px`)
    .text(style.arrow ?? "");

  g.select(".chart-marker-label")
    .attr("display", isCircle ? "none" : null)
    .attr("fill", style.labelFill)
    .attr("font-size", `${style.fontSize}px`)
    .text(style.label);
}

/**
 * All markers pinned above the x-axis. Earnings sit on the bottom when
 * multiple markers share a candle.
 */
export function renderChartMarkers(
  parent,
  markerNodes,
  { xScale, height, colors, onEarningsClick },
) {
  const anchorY = height - 3;

  parent
    .selectAll("g.chart-marker")
    .data(markerNodes, (d) => d.key)
    .join(
      (enter) => {
        const g = enter
          .append("g")
          .attr("class", "chart-marker")
          .style("cursor", (d) =>
            d.marker.type === "earnings" ? "pointer" : "default",
          )
          .style("pointer-events", (d) =>
            d.marker.type === "earnings" ? "all" : "none",
          );

        g.append("path")
          .attr("class", "chart-marker-pentagon")
          .attr("d", pentagonPath())
          .attr("stroke-width", 1.25);

        g.append("circle")
          .attr("class", "chart-marker-circle")
          .attr("cx", 0)
          .attr("cy", -CIRCLE_R)
          .attr("r", CIRCLE_R)
          .attr("stroke-width", 1.25);

        g.append("text")
          .attr("class", "chart-marker-label")
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("y", -PENTAGON_H * 0.42)
          .attr("font-weight", 700)
          .attr("font-family", colors.fontBody);

        g.append("text")
          .attr("class", "chart-marker-letter")
          .attr("text-anchor", "end")
          .attr("dominant-baseline", "central")
          .attr("x", -0.5)
          .attr("y", -CIRCLE_R)
          .attr("font-weight", 700)
          .attr("font-family", colors.fontBody);

        g.append("text")
          .attr("class", "chart-marker-arrow")
          .attr("text-anchor", "start")
          .attr("dominant-baseline", "central")
          .attr("x", 0.5)
          .attr("y", -CIRCLE_R - 0.5)
          .attr("font-weight", 700)
          .attr("font-family", colors.fontBody);

        return g;
      },
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("transform", (d) => {
      const y = anchorY - d.stackPos * (BADGE_SIZE + BADGE_GAP);
      return `translate(${xScale(d.index)},${y})`;
    })
    .each(function (d) {
      applyMarkerStyle(select(this), d, colors);
    })
    .on("click", (event, d) => {
      if (d.marker.type !== "earnings") return;
      event.stopPropagation();
      onEarningsClick?.(d.marker.earning, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    });

  parent.raise();
}
