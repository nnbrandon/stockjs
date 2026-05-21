import { select } from "d3-selection";

/**
 * Create the body-attached tooltip `<div>` and return a small controller for
 * showing/hiding/destroying it. The element uses the global `.tooltip` class
 * (see src/index.css) so it's themed alongside the rest of the app.
 *
 * `destroy()` removes the DOM node — important because the chart is rebuilt
 * on every theme/data/resize change and the old tooltip would otherwise leak
 * an orphan div onto `<body>` each time.
 */
export function createTooltip() {
  const node = select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  return {
    show() {
      node.style("opacity", 1);
    },
    hide() {
      node.style("opacity", 0);
    },
    update({ html, pageX, pageY, borderColor }) {
      node
        .style("left", pageX + 5 + "px")
        .style("top", pageY - 30 + "px")
        .html(html)
        .style("border-top", `4px solid ${borderColor}`);
    },
    destroy() {
      node.remove();
    },
  };
}

/**
 * Append a transparent overlay rect that captures pointer events for hover
 * detection. Lives at the top of the chart group so it sits above the candles
 * but below explicitly-later-appended elements like the close-price label.
 *
 * Callbacks receive the raw d3 event so the caller can use `pointer(event)`
 * and access `event.pageX`/`event.pageY` for tooltip positioning.
 */
export function attachTooltipOverlay(
  parent,
  { width, height, onMove, onEnter, onLeave },
) {
  return parent
    .append("rect")
    .attr("class", "overlay")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mouseover", onEnter)
    .on("mouseout", onLeave)
    .on("mousemove", onMove);
}
