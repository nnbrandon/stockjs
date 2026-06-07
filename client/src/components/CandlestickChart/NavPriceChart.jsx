import { useEffect, useRef } from "react";
import { debounce } from "lodash";
import { createLineChart } from "./d3/LineChart";
import { CHART_MARGIN } from "./d3/Chart";
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

export default function NavPriceChart({ chartData }) {
  const svgRef = useRef(null);
  const chartRef = useRef(null);
  const { mode } = useMode();

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const drawChart = () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
      }
      const svgRect = svgElement.getBoundingClientRect();
      chartRef.current = createLineChart(svgElement, {
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
  }, [chartData, mode]);

  return (
    <div className={styles.paper}>
      <p className={styles.navNote}>Daily NAV — line chart</p>
      <svg ref={svgRef} className={styles.container} />
    </div>
  );
}
