import { select, pointer } from "d3-selection";
import { timeFormat, timeParse } from "d3-time-format";
import { scaleLinear, scaleQuantize, scaleBand } from "d3-scale";
import { min, max, range, bisector } from "d3-array";
import { axisLeft, axisBottom } from "d3-axis";
import { zoom, zoomTransform } from "d3-zoom";

/**
 * Needs more refactoring still... class is too big
 */
export class Chart {
  MARGIN = { top: 15, right: 65, bottom: 205, left: 50 };
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
    this.addZoom();
    this.addTooltip();
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
      .style("position", "absolute")
      .style("width", "30%")
      .style("z-index", 30)
      .style("white-space", "pre-wrap")
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
      .attr("class", "axis x-axis") //Assign "axis" class
      .attr("transform", "translate(0," + this.height + ")")
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
    this.yAxis = axisLeft(this.yScale);
    this.gY = this.svgContainer
      .append("g")
      .attr("class", "axis y-axis")
      .call(this.yAxis);
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
      .attr("fill", (datum) =>
        datum.open === datum.close
          ? "silver"
          : datum.open > datum.close
            ? "red"
            : "green"
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
          ? "white"
          : datum.open > datum.close
            ? "red"
            : "green"
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
        .html(text.trim());
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
    this.gX.call(
      axisBottom(xScaleZ).tickFormat(this.formatDateText.bind(this))
    );

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

      this.gY.transition().duration(250).call(axisLeft(this.yScale));
    }, 500);
  }

  formatDateText(domainValue, _) {
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
}
