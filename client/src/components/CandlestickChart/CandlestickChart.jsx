import { useEffect, useRef } from "react";
import { debounce } from "lodash";
import { createChart, CHART_MARGIN } from "./d3/Chart";
import { useMode } from "../ModeProvider";
import styles from "./CandlestickChart.module.css";

function readThemeColors() {
  const root = document.documentElement;
  const get = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  return {
    success: get("--palette-success"),
    error: get("--palette-error"),
    divider: get("--palette-divider-strong"),
    textSecondary: get("--palette-text-secondary"),
    textDisabled: get("--palette-text-disabled"),
    bgElevated: get("--palette-bg-elevated"),
    bgPaper: get("--palette-bg-paper"),
    fontMono: get("--font-mono"),
    fontBody: get("--font-body"),
  };
}

export default function CandlestickChart({ chartData }) {
  const svgRef = useRef(null);
  const chartRef = useRef(null);
  const { mode } = useMode();

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const drawChart = () => {
      // Tear down the previous chart (removes its body-attached tooltip div)
      // before clearing the SVG and rebuilding from scratch.
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
      }
      const svgRect = svgElement.getBoundingClientRect();
      // Subtract the chart's internal margins so the SVG's intrinsic width/height
      // (set inside createChart > initSvg) matches its rendered CSS size — otherwise
      // labels in the right margin (close price, volume tag) get clipped.
      chartRef.current = createChart(svgElement, {
        chartData,
        width: Math.max(
          0,
          svgRect.width - CHART_MARGIN.left - CHART_MARGIN.right,
        ),
        height: Math.max(
          0,
          svgRect.height - CHART_MARGIN.top - CHART_MARGIN.bottom,
        ),
        colors: readThemeColors(),
      });
    };

    const debouncedRedraw = debounce(drawChart, 150);

    drawChart();
    window.addEventListener("resize", debouncedRedraw);

    return () => {
      window.removeEventListener("resize", debouncedRedraw);
      debouncedRedraw.cancel();
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, mode]);

  return (
    <div className={styles.paper}>
      <svg ref={svgRef} className={styles.container} />
    </div>
  );
}
