import { select, pointer } from "d3-selection";
import { timeFormat } from "d3-time-format";
import { scaleLinear, scaleQuantize, scaleBand } from "d3-scale";
import { min, max, range } from "d3-array";
import { makeDateTickFormatter } from "./format";
import { renderXAxis, renderYAxis, styleAxis } from "./axes";
import { renderGrid } from "./grid";
import { renderCandles, renderStems, candleColor } from "./candlestick";
import {
  buildVolumeScale,
  getVolumeLayout,
  renderVolumeBars,
  renderVolumeIndicator,
} from "./volume";
import { renderLatestCloseLine } from "./priceLine";
import { findEngulfingMarkerIndices } from "../../../utils/patternRecognizer";
import {
  matchEarningsToChart,
  buildMarkerStacks,
  renderChartMarkers,
} from "./chartMarkers";
import { createTooltip, attachTooltipOverlay } from "./chartTooltip";
import { attachZoom, getZoomTransform } from "./zoom";

export const CHART_MARGIN = { top: 15, right: 65, bottom: 25, left: 50 };

const DEFAULT_COLORS = {
  success: "#22c55e",
  error: "#ef4444",
  divider: "#444",
  textSecondary: "#9ca0a8",
  textDisabled: "#5d626c",
  bgElevated: "#15171c",
  bgPaper: "#0e0f13",
  fontMono: "'Geist Mono', monospace",
  fontBody: "'Geist', sans-serif",
};

const ZOOM_END_TRANSITION_MS = 250;
const ZOOM_END_DEBOUNCE_MS = 500;

/**
 * Mount a candlestick chart inside the provided SVG element.
 *
 * Returns a controller `{ destroy }`. Call `destroy()` before recreating the
 * chart (e.g. on resize / theme change / data change) so the body-attached
 * tooltip div is cleaned up and we don't leak DOM nodes.
 *
 * Composition over inheritance: this function is a pure d3 reusable-chart
 * factory — see ./axes, ./grid, ./candlestick, ./volume, ./priceLine,
 * ./chartTooltip, ./zoom for the individual concerns.
 */
export function createChart(
  svgElement,
  {
    chartData,
    width,
    height,
    colors,
    earnings = [],
    onEarningsClick,
    markerVisibility = {},
  },
) {
  const palette = { ...DEFAULT_COLORS, ...colors };
  const data = chartData.map((d) => ({ ...d, date: new Date(d.date) }));
  const dates = data.map((d) => d.date);
  const earningsMarkers = matchEarningsToChart(earnings, data);
  const { bullish, bearish } = findEngulfingMarkerIndices(data);

  const { svgGroup, chartBody } = initSvg(svgElement, { width, height });
  const markersLayer = svgGroup.append("g").attr("class", "chart-markers-layer");

  // ─── Scales ─────────────────────────────────────────────────────────────
  const xScale = scaleLinear([-1, dates.length], [0, width]);
  const xDateScale = scaleQuantize([0, dates.length], dates);
  const xBand = scaleBand(range(-1, dates.length), [0, width]).padding(0.3);

  const { volumeY } = getVolumeLayout(height);
  const initialYDomain = computeYDomain(data);
  if (!initialYDomain) {
    throw new Error("Unable to chart data: empty or invalid high/low values");
  }
  const yScale = scaleLinear()
    .domain(initialYDomain)
    .range([volumeY, 0])
    .nice();

  // ─── Axes + grid ────────────────────────────────────────────────────────
  const { g: gX, axis: xAxis } = renderXAxis(svgGroup, {
    xScale,
    height,
    width,
    tickFormat: makeDateTickFormatter(dates),
  });
  const { g: gY, axis: yAxis } = renderYAxis(svgGroup, { yScale, width });
  styleAxis(gX, palette);
  styleAxis(gY, palette, { isVertical: true });

  renderGrid(svgGroup, { xScale, yScale, width, height, colors: palette });

  // ─── Data layers ────────────────────────────────────────────────────────
  const candles = renderCandles(chartBody, data, {
    xScale,
    bandwidth: xBand.bandwidth(),
    yScale,
    colors: palette,
  });
  const stems = renderStems(chartBody, data, {
    xScale,
    yScale,
    colors: palette,
  });

  drawVolume(data, { xScale, bandwidth: xBand.bandwidth() });
  drawLatestCloseLine();
  drawChartMarkers();

  // ─── Interactions ───────────────────────────────────────────────────────
  attachZoom(svgGroup, { width, height, onZoom, onZoomEnd });

  const tooltip = createTooltip();
  attachTooltipOverlay(svgGroup, {
    width,
    height,
    onEnter: () => tooltip.show(),
    onLeave: () => tooltip.hide(),
    onMove: (event) => {
      const datum = findDatumAt(event, svgGroup.node(), xScale, data);
      if (!datum) return;
      tooltip.update({
        html: formatTooltipHtml(datum),
        pageX: event.pageX,
        pageY: event.pageY,
        borderColor: candleColor(datum, palette),
      });
    },
  });

  let zoomEndTimer = null;

  // ─── Inner helpers ──────────────────────────────────────────────────────
  // These close over the scales / selections built above so they don't need
  // long argument lists, and they stay tied to a single chart instance.

  function drawVolume(visibleData, { xScale: xs, bandwidth }) {
    const { volumeHeight, volumeY } = getVolumeLayout(height);
    const volumeScale = buildVolumeScale(visibleData, volumeHeight);
    renderVolumeBars(svgGroup, data, {
      xScale: xs,
      bandwidth,
      volumeScale,
      volumeHeight,
      volumeY,
      colors: palette,
    });
    renderVolumeIndicator(svgGroup, visibleData, {
      width,
      volumeScale,
      volumeY,
      volumeHeight,
      colors: palette,
    });
  }

  function drawLatestCloseLine() {
    renderLatestCloseLine(svgGroup, data[data.length - 1], {
      width,
      height,
      yScale,
      plotBottom: volumeY,
      colors: palette,
    });
  }

  function drawChartMarkers(xScaleToUse = xScale) {
    const markerNodes = buildMarkerStacks({
      earningsMarkers,
      bullishIndices: bullish,
      bearishIndices: bearish,
      visibility: markerVisibility,
    });
    renderChartMarkers(markersLayer, markerNodes, {
      xScale: xScaleToUse,
      height,
      colors: palette,
      onEarningsClick,
    });
  }

  function onZoom(event) {
    const t = event.transform;
    const xScaleZ = t.rescaleX(xScale);
    const bandwidth = xBand.bandwidth() * t.k;

    gX.call(xAxis.scale(xScaleZ));
    styleAxis(gX, palette);

    const visibleData = getVisibleData(xScaleZ, data);
    const domain = computeYDomain(visibleData);
    if (domain) yScale.domain(domain);

    gY.call(yAxis);
    styleAxis(gY, palette, { isVertical: true });

    // Same data, new scales — d3 join reuses the existing DOM nodes.
    renderCandles(chartBody, data, {
      xScale: xScaleZ,
      bandwidth,
      yScale,
      colors: palette,
    });
    renderStems(chartBody, data, {
      xScale: xScaleZ,
      yScale,
      colors: palette,
    });

    drawVolume(visibleData, { xScale: xScaleZ, bandwidth });
    drawLatestCloseLine();
    drawChartMarkers(xScaleZ);

    renderGrid(svgGroup, {
      xScale: xScaleZ,
      yScale,
      width,
      height,
      colors: palette,
    });
  }

  function onZoomEnd(event) {
    const t = event.transform;
    const xScaleZ = t.rescaleX(xScale);

    clearTimeout(zoomEndTimer);
    zoomEndTimer = setTimeout(() => {
      const xmin = new Date(xDateScale(Math.floor(xScaleZ.domain()[0])));
      const xmax = new Date(xDateScale(Math.floor(xScaleZ.domain()[1])));
      const filtered = data.filter((d) => d.date >= xmin && d.date <= xmax);
      const domain = computeYDomain(filtered);
      if (!domain) return;

      yScale.domain(domain);

      candles
        .transition()
        .duration(ZOOM_END_TRANSITION_MS)
        .attr("y", (d) => yScale(Math.max(d.open, d.close)))
        .attr("height", (d) =>
          d.open === d.close
            ? 1
            : yScale(Math.min(d.open, d.close)) -
              yScale(Math.max(d.open, d.close)),
        );

      stems
        .transition()
        .duration(ZOOM_END_TRANSITION_MS)
        .attr("y1", (d) => yScale(d.high))
        .attr("y2", (d) => yScale(d.low));

      const { volumeHeight, volumeY } = getVolumeLayout(height);
      const volumeScale = buildVolumeScale(filtered, volumeHeight);
      renderVolumeIndicator(svgGroup, filtered, {
        width,
        volumeScale,
        volumeY,
        volumeHeight,
        colors: palette,
      });
    }, ZOOM_END_DEBOUNCE_MS);

    drawLatestCloseLine();
    drawChartMarkers(xScaleZ);
  }

  // ─── Public controller ──────────────────────────────────────────────────
  return {
    destroy() {
      clearTimeout(zoomEndTimer);
      tooltip.destroy();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Module-level helpers (no chart-instance state)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Set the passed SVG element's width/height to fit the plot area + margins,
 * then build the inner `<g>` (translated by the margin) plus the clip-path
 * and a chart-body group that everything plotted clips against.
 */
function initSvg(svgElement, { width, height }) {
  const svg = select(svgElement)
    .attr("width", width + CHART_MARGIN.left + CHART_MARGIN.right)
    .attr("height", height + CHART_MARGIN.top + CHART_MARGIN.bottom);

  const svgGroup = svg
    .append("g")
    .attr("transform", `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`);

  // Clip path so candles/volume don't bleed past the plot area on zoom.
  svgGroup
    .append("defs")
    .append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const chartBody = svgGroup
    .append("g")
    .attr("class", "chartBody")
    .attr("clip-path", "url(#clip)");

  return { svgGroup, chartBody };
}

/** Pad the data's [low, high] range by 10% so candles don't kiss the edges. */
function computeYDomain(data) {
  const minP = min(data, (d) => d.low);
  const maxP = max(data, (d) => d.high);
  if (minP == null || maxP == null) return null;
  const buffer = (maxP - minP) * 0.1;
  return [minP - buffer, maxP + buffer];
}

function getVisibleData(xScaleZ, data) {
  const [start, end] = xScaleZ.domain();
  const startIdx = Math.max(0, Math.floor(start));
  const endIdx = Math.min(data.length - 1, Math.ceil(end));
  return data.slice(startIdx, endIdx + 1);
}

function findDatumAt(event, svgNode, xScale, data) {
  const transform = getZoomTransform(svgNode);
  const xScaleZ = transform.rescaleX(xScale);
  const x0 = xScaleZ.invert(pointer(event)[0]);
  const index = Math.max(0, Math.min(Math.round(x0), data.length - 1));
  return data[index];
}

function formatTooltipHtml(datum) {
  return [
    timeFormat("%a, %b %d, %Y")(datum.date),
    `Open: ${datum.open.toFixed(2)}`,
    `Close: ${datum.close.toFixed(2)}`,
    `High: ${datum.high.toFixed(2)}`,
    `Low: ${datum.low.toFixed(2)}`,
    `Volume: ${datum.volume.toLocaleString()}`,
  ].join("<br>");
}
