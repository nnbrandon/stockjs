# Candlestick Chart — Mental Model

Hi! This folder draws the price chart you see when you click a ticker.
It's written with [d3](https://d3js.org/), which is a library for drawing
things into SVG with data.

If you've never touched d3 before, here's everything you need to know to
work in this folder.

---

## 1. What's on the screen?

```
 ┌─────────────────────────────────────────────┐ ← outer SVG
 │  · · · · · · · · · · · · · · · ·         420│
 │      ┃                                       │
 │  ┃   ┃ ┏┓                       ╴╴╴╴╴╴ 414  │ ← latest-close line
 │  ┃   ┃ ┗┛  ┏┓                                │
 │  ┛   ┛     ┗┛ ┏┓                          400│
 │  · · · · · · · · · · · · · · · ·             │
 │  ▌  ▌  ▍  ▌  ▍  ▊  ▎  ▍  ▎  ▌            38M│ ← volume indicator
 │  ▌  ▌  ▍  ▌  ▍  ▊  ▎  ▍  ▎  ▌                │
 │  Mar 6   Mar 13   Mar 20   Mar 27           │
 └─────────────────────────────────────────────┘
```

The chart has 7 visual layers, drawn back to front:

1. **Background** — invisible. Just the SVG and a `<g>` group with padding.
2. **Grid** — the dashed `· · · ·` lines you see crossing the chart.
3. **Axes** — the price labels on the right and date labels at the bottom.
4. **Candles** — the colored rectangles (green if close ≥ open, red otherwise).
5. **Stems** — the thin vertical "wicks" showing each day's high and low.
6. **Volume bars** — the chunky bars at the bottom.
7. **Decorations** — the latest-close horizontal dashed line and the volume
   indicator (the little colored circle on the right edge).

Plus two things you don't _see_:

- **Tooltip** — a `<div>` glued to `<body>` that shows numbers when you hover.
- **Zoom behavior** — listens for mouse drag/scroll on the chart.

---

## 2. The cast of files

Each file has **one job** and tries to do it well.

| File                  | What it does                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`Chart.js`**        | The orchestrator. Builds the SVG, the scales, then calls every other module in the right order. Exports `createChart(svgEl, opts)`.     |
| **`axes.js`**         | Draws the date axis (bottom) and price axis (right). Plus `styleAxis` — our "minimalist" axis style (no tick marks, Geist Mono labels). |
| **`grid.js`**         | Draws the dashed horizontal + vertical guide lines.                                                                                     |
| **`candlestick.js`**  | Draws the candle rectangles and stem lines.                                                                                             |
| **`volume.js`**       | Draws the volume bars at the bottom, plus the little colored circle + label on the right that shows the latest volume.                  |
| **`priceLine.js`**    | Draws the dashed "current price" line and its pill-shaped label.                                                                        |
| **`chartTooltip.js`** | Creates the `<div>` tooltip and the invisible mouse-capture overlay.                                                                    |
| **`zoom.js`**         | Wires up d3-zoom so you can pan and scroll-wheel.                                                                                       |
| **`format.js`**       | Date/number formatters (e.g. "Mar 5 2026", "3.42M").                                                                                    |

That's it. There's no shared mutable state between the modules — everyone
takes what they need as function arguments and returns what they make.

---

## 3. Scales: the "translators" between data and pixels

This is the _one d3 concept_ you really need to internalize.

A **scale** is a function that converts something in your data
(like a price of `$414.05`) into a pixel position on the screen
(like `y = 137`).

We use four of them:

```js
xScale(i); // candle index → x pixel
yScale(price); // dollar price → y pixel
xBand; // gives us "how wide should each candle be in pixels?"
xDateScale(i); // candle index → real Date object
```

When you **zoom**, we don't change the data — we just create a _new_,
rescaled `xScale` (`xScaleZ`) and re-render with it. Same data, new lens.

---

## 4. How `createChart` runs (the lifecycle)

When you mount `<CandlestickChart>`, here's what happens, in order:

```
createChart(svgEl, { chartData, width, height, colors })
│
├─ initSvg() ──── set width/height, build the <g> group, add clipPath
│                  + an empty <g class="chartBody"> we'll fill later
│
├─ build scales (xScale, yScale, xBand, xDateScale)
│
├─ renderXAxis()  ─┐
├─ renderYAxis()  ─┤ ← "draw the axis frames"
├─ styleAxis() x2 ─┘
│
├─ renderGrid() ───── dashed lines first so they're behind the candles
│
├─ renderCandles() ─┐
├─ renderStems()    │ ← "fill the chartBody with shapes"
├─ drawVolume()     │
├─ drawLatestCloseLine()
│
├─ attachZoom() ────── start listening for mouse drag / wheel
├─ createTooltip()
└─ attachTooltipOverlay() ─ invisible <rect> that fires onMove/onEnter/onLeave

returns: { destroy() }
```

When the chart needs to go away (theme switch, window resize, you change
ticker), `destroy()` removes the body tooltip div so it doesn't pile up.

---

## 5. How zoom + pan work

When you drag or scroll the chart, **d3-zoom** fires our `onZoom` callback
many times per second. The handler is in `Chart.js` and does roughly:

```js
function onZoom(event) {
  const xScaleZ = event.transform.rescaleX(xScale);  // new lens
  const bandwidth = xBand.bandwidth() * event.transform.k;

  // Re-call every render module with the new scales.
  // d3's .join() is smart: it reuses the existing <rect>/<line> nodes
  // and just updates their attributes. No DOM churn.
  renderCandles(chartBody, data, { xScale: xScaleZ, bandwidth, ... });
  renderStems(...);
  drawVolume(...);
  renderGrid(...);
  // ...and redraw axes with the new scale
}
```

The trick that makes this fast is **d3's enter/update/exit pattern** via
`.join()`. When `renderCandles` runs the first time, it _creates_ one `<rect>`
per data point. Every subsequent call _reuses_ those same rects and only
updates the changed attributes. Zoom feels smooth because we're not destroying
and recreating DOM elements 60 times a second.

There's also `onZoomEnd` — fires once when you let go of the mouse. We use it
to do the "expensive" thing: smoothly transition the y-axis to fit the
currently-visible candles tightly. (See `ZOOM_END_DEBOUNCE_MS` in `Chart.js`.)

---

## 6. Why we use **closures**, not classes

Look at `createChart`. After it sets up the scales and DOM, it defines a
few inner functions like `onZoom`, `onZoomEnd`, `drawVolume`. These
"close over" the surrounding variables — they remember `xScale`, `gX`,
`chartBody`, etc. without us passing them as arguments.

This is the [d3 reusable chart pattern](https://bost.ocks.org/mike/chart/).
It replaces the class-with-`this`-everywhere style and:

- makes the data flow obvious (you can read top to bottom)
- gives us free **encapsulation** (nothing outside `createChart` can poke at our scales)
- returns a tiny public API: just `{ destroy }`

---

## 7. Want to change something? Here's where to look.

| I want to…                                     | Edit…                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change the candle/up colors                    | `colors` in `theme.js` (the chart reads CSS variables via `readThemeColors` in `CandlestickChart.jsx`)                                                  |
| Change the grid line style                     | `renderGrid` in `grid.js`                                                                                                                               |
| Change axis font/spacing                       | `styleAxis` in `axes.js` (and the constants in `chart.js`'s `CHART_MARGIN`)                                                                             |
| Add a tooltip field                            | `formatTooltipHtml` in `Chart.js`                                                                                                                       |
| Change candle width/spacing                    | `xBand` setup in `Chart.js`, and the `bandwidth` you pass to `renderCandles`                                                                            |
| Add a new visual layer (e.g. a moving average) | Make a new file like `movingAverage.js` that exports `renderMovingAverage`, then call it from `Chart.js` between `drawVolume` and `drawLatestCloseLine` |
| Change what happens on hover                   | `onMove` callback in `Chart.js`'s `attachTooltipOverlay` block                                                                                          |

---

## 8. Quick d3 cheat-sheet for this codebase

You'll see these patterns a lot:

```js
parent
  .selectAll("rect.candle")    // grab all existing candles (none on first call)
  .data(d3ChartData)           // bind data: each datum → one rect
  .join("rect")                // enter/update/exit; creates/reuses rects
  .attr("x", (d, i) => ...)    // set attrs from data
  .attr("fill", "...");
```

- `.data(arr)` says "I want one DOM node per element in arr".
- `.join("rect")` is the magic — it creates new `<rect>`s for new data,
  reuses existing ones for matched data, and removes leftovers. No
  manual `remove()` + `append()` loops.

That's basically it. Everything else in this folder is just composing
those primitives into something that looks like a chart.

Happy hacking!
