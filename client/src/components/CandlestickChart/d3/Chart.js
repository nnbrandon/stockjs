import { select, pointer } from "d3-selection";
import { timeFormat, timeParse } from "d3-time-format";
import { scaleLinear, scaleQuantize, scaleBand } from "d3-scale";
import { min, max, range } from "d3-array";
import { axisBottom, axisRight } from "d3-axis";
import { zoom, zoomTransform } from "d3-zoom";

/**
 * Needs more refactoring still... class is too big
 */
export class Chart {
  MARGIN = { top: 15, right: 65, bottom: 0, left: 50 };
  MONTHS = {
    0: "Jan",
    1: "Feb",
    2: "Mar",
    3: "Apr",
    4: "May",
    5: "Jun",
    6: "Jul",
    7: "Aug",
    8: "Sep",
    9: "Oct",
    10: "Nov",
    11: "Dec",
  };
  d3ChartData;
  _chartData;
  dates;
  resizeTimer;
  height;
  width;

  get chartData() {
    return this._chartData;
  }

  set chartData(data) {
    this.d3ChartData = data.map((data) => {
      const d = Object.assign({}, data);
      d.date = timeParse("%Y-%m-%d")(d.date);
      return d;
    });
  }

  // D3 Chart Elements
  svgContainer;
  tooltip;
  chartBody;
  xScale;
  xDateScale;
  xBand;
  xAxis;
  gX;
  yScale;
  yAxis;
  gY;

  // D3 Chart Content Elements
  candles;
  stems;

  constructor({ chartData, height, width }) {
    this._chartData = chartData;
    this.d3ChartData = chartData.map((data) => {
      const d = Object.assign({}, data);
      d.date = new Date(d.date);
      return d;
    });
    this.dates = this.d3ChartData.map((datum) => datum.date);
    this.height = height;
    this.width = width;

    this.drawChart();
  }

  drawChart() {
    this.setupChart();
    this.drawRectangles();
    this.drawStems();
    this.drawVolumeBars();
    this.addZoom();
    this.addTooltip();
    this.drawLatestCloseLine(); // Draw latest close line after chart elements
  }

  setupChart() {
    this.svgContainer = select("#container")
      .attr("width", this.width + this.MARGIN.left + this.MARGIN.right)
      .attr("height", this.height + this.MARGIN.top + this.MARGIN.bottom)
      .append("g")
      .attr(
        "transform",
        "translate(" + this.MARGIN.left + "," + this.MARGIN.top + ")"
      );
    this.svgContainer
      .append("rect")
      .attr("id", "rect")
      .attr("width", this.width)
      .attr("height", this.height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .attr("clip-path", "url(#clip)");
    this.svgContainer
      .append("defs")
      .append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("width", this.width)
      .attr("height", this.height);

    this.tooltip = select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("min-width", "180px")
      .style("max-width", "320px")
      .style("background", "#232a34")
      .style("color", "#fff")
      .style("border-radius", "8px")
      .style("box-shadow", "0 4px 16px rgba(0,0,0,0.25)")
      .style("padding", "16px 20px")
      .style("font-family", "Segoe UI, Arial, sans-serif")
      .style("font-size", "15px")
      .style("z-index", 30)
      .style("white-space", "pre-wrap")
      .style("pointer-events", "none")
      .style("visibility", "hidden");
    this.chartBody = this.svgContainer
      .append("g")
      .attr("class", "chartBody")
      .attr("clip-path", "url(#clip)");
    this.xScale = scaleLinear([-1, this.dates.length], [0, this.width]);
    this.xDateScale = scaleQuantize([0, this.dates.length], this.dates);
    this.xBand = scaleBand(range(-1, this.dates.length), [
      0,
      this.width,
    ]).padding(0.3);
    this.xAxis = axisBottom(this.xScale).tickFormat(
      this.formatDateText.bind(this)
    );
    this.gX = this.svgContainer
      .append("g")
      .attr("class", "axis x-axis")
      .attr("transform", "translate(0," + this.height + ")") // Place at bottom edge
      .call(this.xAxis);

    const ymin = min(this.d3ChartData, (datum) => datum.low);
    const ymax = max(this.d3ChartData, (datum) => datum.high);
    if (!ymin || !ymax) {
      throw new Error("Unable to chart data");
    }
    this.yScale = scaleLinear()
      .domain([ymin, ymax])
      .range([this.height, 0])
      .nice();
    this.yAxis = axisRight(this.yScale); // Change from axisLeft to axisRight
    this.gY = this.svgContainer
      .append("g")
      .attr("class", "axis y-axis")
      .attr("transform", `translate(${this.width},0)`) // Move to right edge
      .call(this.yAxis);

    // Axis styling
    this.svgContainer.selectAll(".axis path").attr("stroke-width", 1);

    this.svgContainer
      .selectAll(".axis line")
      .attr("stroke", "#444")
      .attr("stroke-width", 1);

    this.svgContainer
      .selectAll(".axis text")
      .attr("font-size", "15px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .attr("transform", null) // Remove any scaling or transforms
      .style("font-size", "15px") // Also set via style for extra force
      .style("transform", "none"); // Remove CSS transforms

    // Modern y-axis styling
    this.gY
      .selectAll("text")
      .attr("font-size", "16px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .attr("text-anchor", "start")
      .attr("dx", "8px")
      .style("paint-order", "stroke")
      .style("stroke-width", "2px")
      .style("stroke-opacity", 0.5);

    // Hide axis line and ticks for minimalist look
    this.gY.selectAll("path").attr("stroke", "none");
    this.gY.selectAll("line").attr("stroke", "none");

    this.gX.selectAll(".domain").attr("stroke", "none");
    this.gX.selectAll("line").attr("stroke", "none");
  }

  drawRectangles() {
    // draw rectangles
    this.candles = this.chartBody
      .selectAll(".candle")
      .data(this.d3ChartData)
      .enter()
      .append("rect")
      .attr("x", (_, i) => this.xScale(i) - this.xBand.bandwidth())
      .attr("class", "candle")
      .attr("y", (datum) => this.yScale(Math.max(datum.open, datum.close)))
      .attr("width", this.xBand.bandwidth())
      .attr("height", (datum) =>
        datum.open === datum.close
          ? 1
          : this.yScale(Math.min(datum.open, datum.close)) -
            this.yScale(Math.max(datum.open, datum.close))
      )
      .attr("rx", 2) // Rounded corners
      .attr(
        "fill",
        (datum) =>
          datum.open === datum.close
            ? "#888"
            : datum.open > datum.close
              ? "#ef5350" // Red for down
              : "#26a69a" // Green for up
      );
  }

  drawStems() {
    // draw high and low
    this.stems = this.chartBody
      .selectAll("g.line")
      .data(this.d3ChartData)
      .enter()
      .append("line")
      .attr("class", "stem")
      .attr("x1", (_, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr("x2", (_, i) => this.xScale(i) - this.xBand.bandwidth() / 2)
      .attr("y1", (datum) => this.yScale(datum.high))
      .attr("y2", (datum) => this.yScale(datum.low))
      .attr("stroke", (datum) =>
        datum.open === datum.close
          ? "#888"
          : datum.open > datum.close
            ? "#ef5350"
            : "#26a69a"
      );
  }

  addTooltip() {
    const tooltip = select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);

    const mousemove = (event) => {
      const transform = zoomTransform(this.svgContainer.node());
      const xScaleZ = transform.rescaleX(this.xScale);
      const xCoordinate = pointer(event)[0];
      const x0 = xScaleZ.invert(xCoordinate);

      let index = Math.round(x0);
      index = Math.max(0, Math.min(index, this.d3ChartData.length - 1));
      const datum = this.d3ChartData[index];

      let text = timeFormat("%a, %b %d, %Y")(datum.date);
      text += "<br>Open: " + datum.open.toFixed(2);
      text += "<br>Close: " + datum.close.toFixed(2);
      text += "<br>High: " + datum.high.toFixed(2);
      text += "<br>Low: " + datum.low.toFixed(2);
      text += "<br>Volume: " + datum.volume.toLocaleString();
      tooltip
        .style("left", event.pageX + 5 + "px")
        .style("top", event.pageY - 30 + "px")
        .html(text.trim())
        .style(
          "border-top",
          datum.open > datum.close ? "4px solid #ef5350" : "4px solid #26a69a"
        );
    };

    this.svgContainer
      .append("rect")
      .attr("class", "overlay")
      .attr("width", this.width)
      .attr("height", this.height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mouseover", function () {
        tooltip.style("opacity", 1);
      })
      .on("mouseout", function () {
        tooltip.style("opacity", 0);
      })
      .on("mousemove", mousemove);
  }

  addZoom() {
    const zoomBehavior = zoom()
      .scaleExtent([1, 100])
      .translateExtent([
        [0, 0],
        [this.width, this.height],
      ])
      .extent([
        [0, 0],
        [this.width, this.height],
      ])
      .on("zoom", this.zoomHandler.bind(this))
      .on("zoom.end", this.zoomEndHandler.bind(this));
    this.svgContainer.call(zoomBehavior);
  }

  zoomHandler(event) {
    const t = event.transform;
    const xScaleZ = t.rescaleX(this.xScale);

    // Redraw x-axis with the zoomed scale
    this.gX.call(this.xAxis.scale(xScaleZ));

    // Optionally, re-apply styling for modern look
    this.gX
      .selectAll("text")
      .attr("font-size", "15px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .attr("transform", null)
      .style("font-size", "15px")
      .style("transform", "none");

    this.gX.selectAll(".domain").attr("stroke", "none");
    this.gX.selectAll("line").attr("stroke", "none");

    // Find visible indices
    const [start, end] = xScaleZ.domain();
    const startIdx = Math.max(0, Math.floor(start));
    const endIdx = Math.min(this.d3ChartData.length - 1, Math.ceil(end));
    const visibleData = this.d3ChartData.slice(startIdx, endIdx + 1);

    // Update yScale domain based on visible data
    let minP = min(visibleData, (d) => d.low);
    let maxP = max(visibleData, (d) => d.high);
    const buffer = Math.floor((maxP - minP) * 0.1);
    this.yScale.domain([minP - buffer, maxP + buffer]);

    // Redraw y-axis
    this.gY.call(axisRight(this.yScale));

    // Optionally, re-apply styling
    this.gY
      .selectAll("text")
      .attr("font-size", "16px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .attr("text-anchor", "start")
      .attr("dx", "8px");

    this.gY.selectAll("path").attr("stroke", "none");
    this.gY.selectAll("line").attr("stroke", "none");

    this.candles
      .attr("x", (_, i) => xScaleZ(i) - (this.xBand.bandwidth() * t.k) / 2)
      .attr("width", this.xBand.bandwidth() * t.k);
    this.stems.attr(
      "x1",
      (_, i) =>
        xScaleZ(i) - this.xBand.bandwidth() / 2 + this.xBand.bandwidth() * 0.5
    );
    this.stems.attr(
      "x2",
      (_, i) =>
        xScaleZ(i) - this.xBand.bandwidth() / 2 + this.xBand.bandwidth() * 0.5
    );

    // Update volume bars on zoom
    this.svgContainer
      .selectAll(".volume-bar")
      .attr("x", (_, i) => xScaleZ(i) - (this.xBand.bandwidth() * t.k) / 2)
      .attr("width", this.xBand.bandwidth() * t.k);

    // Volume area and scale for visible data
    const volumeHeight = this.height * 0.2;
    const volumeY = this.height - volumeHeight;
    const volumeScale = scaleLinear()
      .domain([0, max(visibleData, (d) => d.volume)])
      .range([volumeHeight, 0]);
    // Update volume indicator in real time
    this.drawVolumeIndicator(visibleData, volumeScale, volumeY, volumeHeight);

    // Redraw latest close line after zoom
    this.drawLatestCloseLine();
  }

  zoomEndHandler(event) {
    const t = event.transform;
    const xScaleZ = t.rescaleX(this.xScale);
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      const xmin = new Date(this.xDateScale(Math.floor(xScaleZ.domain()[0])));
      const xmax = new Date(this.xDateScale(Math.floor(xScaleZ.domain()[1])));
      const filtered = this.d3ChartData.filter(
        (datum) => datum.date >= xmin && datum.date <= xmax
      );
      let minP = min(filtered, (datum) => datum.low);
      let maxP = max(filtered, (datum) => datum.high);
      minP = minP ? +minP : undefined;
      maxP = maxP ? +maxP : undefined;
      if (!minP || !maxP) {
        return;
      }

      const buffer = Math.floor((maxP - minP) * 0.1);

      this.yScale.domain([minP - buffer, maxP + buffer]);
      this.candles
        .transition()
        .duration(250)
        .attr("y", (datum) => this.yScale(Math.max(datum.open, datum.close)))
        .attr("height", (datum) =>
          datum.open === datum.close
            ? 1
            : this.yScale(Math.min(datum.open, datum.close)) -
              this.yScale(Math.max(datum.open, datum.close))
        );

      this.stems
        .transition()
        .duration(250)
        .attr("y1", (datum) => this.yScale(datum.high))
        .attr("y2", (datum) => this.yScale(datum.low));

      // Update volume indicator on zoom end
      const volumeHeight = this.height * 0.2;
      const volumeY = this.height - volumeHeight;
      const volumeScale = scaleLinear()
        .domain([0, max(filtered, (d) => d.volume)])
        .range([volumeHeight, 0]);
      this.drawVolumeIndicator(filtered, volumeScale, volumeY, volumeHeight);
    }, 500);

    this.drawLatestCloseLine(); // Redraw latest close line after zoom
  }

  formatDateText(domainValue) {
    const value = domainValue.valueOf();
    if (value >= 0 && value <= this.dates.length - 1) {
      const date = this.dates[value];
      return (
        this.MONTHS[date.getMonth()] +
        " " +
        date.getDate() +
        " " +
        date.getFullYear()
      );
    }

    return "";
  }

  formatShortNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toString();
  }

  drawVolumeBars() {
    // Define the height for the volume bars area (e.g., 1/5 of chart height)
    const volumeHeight = this.height * 0.2;
    const volumeY = this.height - volumeHeight;

    // Create a scale for volume
    const volumeScale = scaleLinear()
      .domain([0, max(this.d3ChartData, (d) => d.volume)])
      .range([volumeHeight, 0]);

    // Add a group for volume bars
    this.svgContainer
      .append("g")
      .attr("class", "volume-bars")
      .attr("transform", `translate(0,${volumeY})`)
      .attr("clip-path", "url(#clip)") // <-- Add this line
      .selectAll(".volume-bar")
      .data(this.d3ChartData)
      .enter()
      .append("rect")
      .attr("class", "volume-bar")
      .attr("x", (_, i) => this.xScale(i) - this.xBand.bandwidth())
      .attr("width", this.xBand.bandwidth())
      .attr("y", (d) => volumeScale(d.volume))
      .attr("height", (d) => volumeHeight - volumeScale(d.volume))
      .attr("fill", (d) =>
        d.open > d.close ? "rgba(239,83,80,0.15)" : "rgba(38,166,154,0.15)"
      );

    // Draw volume indicator
    this.drawVolumeIndicator(
      this.d3ChartData,
      volumeScale,
      volumeY,
      volumeHeight
    );
  }

  drawVolumeIndicator(filteredData, volumeScale, volumeY, volumeHeight) {
    this.svgContainer.selectAll(".volume-indicator").remove();
    this.svgContainer.selectAll(".volume-indicator-label").remove();
    this.svgContainer.selectAll(".volume-indicator-bg").remove();

    if (!filteredData.length) return;

    // Find the rightmost visible index (the one closest to the right edge)
    const rightmostIdx = filteredData.length - 1;
    const lastDatum = filteredData[rightmostIdx];
    const lastVolume = lastDatum.volume;

    // Calculate the x position for the rightmost bar
    const xPos = this.width; // y-axis is at the right edge
    const yPos = volumeY + volumeScale(lastVolume);

    // Only draw if yPos is within volume area bounds
    if (yPos < volumeY || yPos > volumeY + volumeHeight) return;

    const color = lastDatum.open > lastDatum.close ? "#ef5350" : "#26a69a";

    // Draw a circle indicator on the y-axis (right side)
    this.svgContainer
      .append("circle")
      .attr("class", "volume-indicator")
      .attr("cx", xPos)
      .attr("cy", yPos)
      .attr("r", 6)
      .attr("fill", color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Add a label background
    const labelText = this.formatShortNumber(lastVolume);
    const labelX = xPos + 10;
    const labelY = yPos + 4;

    // Create a temporary text element to measure width
    const tempText = this.svgContainer
      .append("text")
      .attr("class", "volume-indicator-label-temp")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("font-size", "13px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .text(labelText);

    const bbox = tempText.node().getBBox();
    tempText.remove();

    // Draw background rect
    this.svgContainer
      .append("rect")
      .attr("class", "volume-indicator-bg")
      .attr("x", bbox.x - 6)
      .attr("y", bbox.y - 2)
      .attr("width", bbox.width + 12)
      .attr("height", bbox.height + 4)
      .attr("rx", 4)
      .attr("fill", "#232a34")
      .attr("opacity", 0.85);

    // Add the label text
    this.svgContainer
      .append("text")
      .attr("class", "volume-indicator-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("fill", color)
      .attr("font-size", "13px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .text(labelText);
  }

  drawLatestCloseLine() {
    this.svgContainer.selectAll(".latest-close-line").remove();
    this.svgContainer.selectAll(".latest-close-label").remove();
    this.svgContainer.selectAll(".latest-close-label-bg").remove();

    if (!this.d3ChartData.length) return;

    const lastDatum = this.d3ChartData[this.d3ChartData.length - 1];
    const closeValue = lastDatum.close;
    const yPos = this.yScale(closeValue);
    const color = lastDatum.open > lastDatum.close ? "#ef5350" : "#26a69a";

    // Only draw if yPos is within chart bounds
    if (yPos < 0 || yPos > this.height) return;

    // Draw horizontal line
    this.svgContainer
      .append("line")
      .attr("class", "latest-close-line")
      .attr("x1", 0)
      .attr("x2", this.width)
      .attr("y1", yPos)
      .attr("y2", yPos)
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.5)
      .attr("stroke-dasharray", "3,3");

    // Prepare label text and position
    const labelText = closeValue.toFixed(2);
    const labelX = this.width;
    const labelY = yPos + 4;

    // Create a temporary text element to measure width
    const tempText = this.svgContainer
      .append("text")
      .attr("class", "latest-close-label-temp")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("font-size", "14px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .text(labelText);

    const bbox = tempText.node().getBBox();
    tempText.remove();

    // Draw background rect behind label
    this.svgContainer
      .append("rect")
      .attr("class", "latest-close-label-bg")
      .attr("x", bbox.x - 6)
      .attr("y", bbox.y - 2)
      .attr("width", bbox.width + 12)
      .attr("height", bbox.height + 4)
      .attr("rx", 4)
      .attr("fill", "#232a34")
      .attr("opacity", 0.85);

    // Draw the label text
    this.svgContainer
      .append("text")
      .attr("class", "latest-close-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("fill", color)
      .attr("font-size", "14px")
      .attr("font-family", "Segoe UI, Arial, sans-serif")
      .attr("text-anchor", "start")
      .attr("opacity", 0.7)
      .text(labelText);
  }
}
