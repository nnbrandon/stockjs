import { useEffect, useRef } from "react";
import { createLineChart } from "./d3/LineChart";
import { CHART_MARGIN } from "./d3/Chart";
import useResizeObserver from "../../hooks/useResizeObserver";
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

  useEffect(
    () => () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    },
    [chartData, mode],
  );

  useResizeObserver(
    svgRef,
    () => {
      const svgElement = svgRef.current;
      if (!svgElement) return;

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
    },
    [chartData, mode],
  );

  return (
    <div className={styles.paper}>
      <p className={styles.navNote}>Daily NAV — line chart</p>
      <svg ref={svgRef} className={styles.container} />
    </div>
  );
}
