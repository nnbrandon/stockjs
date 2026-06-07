import { select, pointer } from "d3-selection";
import { line, area } from "d3-shape";
import { timeFormat } from "d3-time-format";
import { scaleLinear } from "d3-scale";
import { min, max } from "d3-array";
import { makeDateTickFormatter } from "./format";
import { renderXAxis, renderYAxis, styleAxis } from "./axes";
import { renderGrid } from "./grid";
import { renderLatestCloseLine } from "./priceLine";
import { createTooltip, attachTooltipOverlay } from "./chartTooltip";
import { attachZoom, getZoomTransform } from "./zoom";
import { CHART_MARGIN } from "./Chart.js";

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
 * Line chart for NAV-priced assets (mutual / index funds) where OHLC is flat.
 */
export function createLineChart(
  svgElement,
  { chartData, width, height, colors },
) {
  const palette = { ...DEFAULT_COLORS, ...colors };
  const data = chartData.map((d) => ({ ...d, date: new Date(d.date) }));
  const dates = data.map((d) => d.date);

  const { svgGroup, chartBody } = initSvg(svgElement, { width, height });

  const xScale = scaleLinear([-1, dates.length], [0, width]);
  const initialYDomain = computeCloseDomain(data);
  if (!initialYDomain) {
    throw new Error("Unable to chart data: empty or invalid close values");
  }
  const yScale = scaleLinear()
    .domain(initialYDomain)
    .range([height, 0])
    .nice();

  const { g: gX, axis: xAxis } = renderXAxis(svgGroup, {
    xScale,
    height,
    width,
    tickFormat: makeDateTickFormatter(dates),
    dataPointCount: dates.length,
  });
  const { g: gY, axis: yAxis } = renderYAxis(svgGroup, { yScale, width });
  styleAxis(gX, palette);
  styleAxis(gY, palette, { isVertical: true });

  renderGrid(svgGroup, { xScale, yScale, width, height, colors: palette });

  const trendUp =
    data.length >= 2 && data.at(-1).close >= data.at(-2).close;
  const strokeColor = trendUp ? palette.success : palette.error;

  drawSeries(chartBody, data, { xScale, yScale, height, strokeColor });
  drawLatestClose();

  const tooltip = createTooltip();
  attachTooltipOverlay(svgGroup, {
    width,
    height,
    onEnter: () => tooltip.show(),
    onMove: (event) => {
      const datum = findDatumAt(event, svgElement, xScale, data);
      if (!datum) return;
      const prev = data[Math.max(0, data.indexOf(datum) - 1)];
      const up = !prev || datum.close >= prev.close;
      tooltip.update({
        html: formatNavTooltipHtml(datum),
        pageX: event.pageX,
        pageY: event.pageY,
        borderColor: up ? palette.success : palette.error,
      });
    },
    onLeave: () => tooltip.hide(),
  });

  let zoomEndTimer;
  attachZoom(svgGroup, {
    width,
    height,
    onZoom,
    onZoomEnd: () => {
      clearTimeout(zoomEndTimer);
      zoomEndTimer = setTimeout(onZoomEnd, ZOOM_END_DEBOUNCE_MS);
    },
  });

  function drawSeries(parent, series, { xScale: xs, yScale: ys, height: h, strokeColor: stroke }) {
    parent.selectAll(".nav-area").remove();
    parent.selectAll(".nav-line").remove();

    const xAt = (_, i) => xs(i);
    const yAt = (d) => ys(d.close);

    parent
      .append("path")
      .attr("class", "nav-area")
      .attr("fill", stroke)
      .attr("fill-opacity", 0.08)
      .attr(
        "d",
        area()
          .x(xAt)
          .y0(h)
          .y1(yAt)(series),
      );

    parent
      .append("path")
      .attr("class", "nav-line")
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", 2)
      .attr("d", line().x(xAt).y(yAt)(series));
  }

  function drawLatestClose(xScaleToUse = xScale, yScaleToUse = yScale) {
    const latest = data.at(-1);
    const prev = data.at(-2);
    if (!latest) return;
    renderLatestCloseLine(chartBody, {
      ...latest,
      open: prev?.close ?? latest.open,
    }, {
      width,
      height,
      yScale: yScaleToUse,
      plotBottom: height,
      colors: palette,
    });
  }

  function onZoom(event) {
    const t = event.transform;
    const xScaleZ = t.rescaleX(xScale);

    gX.call(xAxis.scale(xScaleZ));
    styleAxis(gX, palette);

    const visible = getVisibleData(xScaleZ, data);
    const domain = computeCloseDomain(visible);
    if (domain) yScale.domain(domain);

    gY.call(yAxis);
    styleAxis(gY, palette, { isVertical: true });

    const visibleUp =
      visible.length >= 2 && visible.at(-1).close >= visible.at(-2).close;
    const color = visibleUp ? palette.success : palette.error;

    drawSeries(chartBody, data, {
      xScale: xScaleZ,
      yScale,
      height,
      strokeColor: color,
    });
    drawLatestClose(xScaleZ, yScale);
    renderGrid(svgGroup, {
      xScale: xScaleZ,
      yScale,
      width,
      height,
      colors: palette,
    });
  }

  function onZoomEnd(event) {
    const xScaleZ = event.transform.rescaleX(xScale);
    const visible = getVisibleData(xScaleZ, data);
    const domain = computeCloseDomain(visible);
    if (!domain) return;

    yScale.domain(domain).nice();
    gY.transition().duration(ZOOM_END_TRANSITION_MS).call(yAxis);
    styleAxis(gY, palette, { isVertical: true });

    const visibleUp =
      visible.length >= 2 && visible.at(-1).close >= visible.at(-2).close;
    const color = visibleUp ? palette.success : palette.error;

    chartBody
      .selectAll(".nav-area")
      .transition()
      .duration(ZOOM_END_TRANSITION_MS)
      .attr(
        "d",
        area()
          .x((_, i) => xScaleZ(i))
          .y0(height)
          .y1((d) => yScale(d.close))(data),
      )
      .attr("fill", color);

    chartBody
      .selectAll(".nav-line")
      .transition()
      .duration(ZOOM_END_TRANSITION_MS)
      .attr(
        "d",
        line()
          .x((_, i) => xScaleZ(i))
          .y((d) => yScale(d.close))(data),
      )
      .attr("stroke", color);

    drawLatestClose(xScaleZ, yScale);
    renderGrid(svgGroup, {
      xScale: xScaleZ,
      yScale,
      width,
      height,
      colors: palette,
    });
  }

  return {
    destroy() {
      clearTimeout(zoomEndTimer);
      tooltip.destroy();
    },
  };
}

function initSvg(svgElement, { width, height }) {
  const svg = select(svgElement)
    .attr("width", width + CHART_MARGIN.left + CHART_MARGIN.right)
    .attr("height", height + CHART_MARGIN.top + CHART_MARGIN.bottom);

  const svgGroup = svg
    .append("g")
    .attr("transform", `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`);

  svgGroup
    .append("defs")
    .append("clipPath")
    .attr("id", "nav-clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const chartBody = svgGroup
    .append("g")
    .attr("class", "chartBody")
    .attr("clip-path", "url(#nav-clip)");

  return { svgGroup, chartBody };
}

function computeCloseDomain(data) {
  const minP = min(data, (d) => d.close);
  const maxP = max(data, (d) => d.close);
  if (minP == null || maxP == null) return null;
  const buffer = Math.max((maxP - minP) * 0.1, 0.01);
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

function formatNavTooltipHtml(datum) {
  return [
    timeFormat("%a, %b %d, %Y")(datum.date),
    `NAV: ${datum.close.toFixed(2)}`,
  ].join("<br>");
}
