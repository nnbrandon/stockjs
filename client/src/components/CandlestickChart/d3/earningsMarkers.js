const MAX_MATCH_MS = 7 * 24 * 60 * 60 * 1000;

const BADGE_W = 17;
const BADGE_H = 15;

/** House / pentagon badge — flat bottom anchors just above the x-axis. */
function earningsBadgePath() {
  const hw = BADGE_W / 2;
  const peak = -BADGE_H;
  const shoulder = -BADGE_H * 0.38;
  return [
    `M 0,${peak}`,
    `L ${hw},${shoulder}`,
    `L ${hw},0`,
    `L ${-hw},0`,
    `L ${-hw},${shoulder}`,
    "Z",
  ].join(" ");
}

/** Snap each earnings report to the nearest candle in the visible series. */
export function matchEarningsToChart(earnings = [], chartData = []) {
  if (!earnings.length || !chartData.length) return [];

  const candles = chartData.map((d, index) => ({
    index,
    time: new Date(d.date).getTime(),
  }));

  return earnings
    .filter((e) => e.reportedDate)
    .map((earning) => {
      const reported = new Date(earning.reportedDate).getTime();
      if (!Number.isFinite(reported)) return null;

      let bestIdx = 0;
      let bestDelta = Infinity;
      for (const c of candles) {
        const delta = Math.abs(c.time - reported);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = c.index;
        }
      }

      if (bestDelta > MAX_MATCH_MS) return null;
      return { earning, index: bestIdx };
    })
    .filter(Boolean);
}

/**
 * TradingView-style pentagon "E" badges pinned just above the x-axis.
 */
export function renderEarningsMarkers(
  parent,
  markers,
  { xScale, height, colors, onClick },
) {
  const pathD = earningsBadgePath();
  // Flat bottom of badge sits a few px above the axis line (y = height).
  const anchorY = height - 3;

  parent
    .selectAll("g.earnings-marker")
    .data(markers, (d) => `${d.earning.date}-${d.earning.reportedDate}`)
    .join(
      (enter) => {
        const g = enter
          .append("g")
          .attr("class", "earnings-marker")
          .style("cursor", "pointer")
          .style("pointer-events", "all");

        g.append("path")
          .attr("class", "earnings-marker-shape")
          .attr("d", pathD)
          .attr("fill", colors.bgPaper)
          .attr("stroke", colors.success)
          .attr("stroke-width", 1.25);

        g.append("text")
          .attr("class", "earnings-marker-label")
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("y", -BADGE_H * 0.42)
          .attr("fill", colors.success)
          .attr("font-size", "10px")
          .attr("font-weight", 700)
          .attr("font-family", colors.fontBody)
          .text("E");

        return g;
      },
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("transform", (d) => `translate(${xScale(d.index)},${anchorY})`)
    .on("click", (event, d) => {
      event.stopPropagation();
      onClick?.(d.earning, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    });

  parent.raise();
}
