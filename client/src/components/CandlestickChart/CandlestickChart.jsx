import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "lodash";
import { createChart, CHART_MARGIN } from "./d3/Chart";
import { useMode } from "../ModeProvider";
import EarningsChartPopover from "./EarningsChartPopover";
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

export default function CandlestickChart({ chartData, earnings = [] }) {
  const svgRef = useRef(null);
  const paperRef = useRef(null);
  const chartRef = useRef(null);
  const onEarningsClickRef = useRef(null);
  const { mode } = useMode();
  const [popover, setPopover] = useState(null);

  const handleEarningsClick = useCallback((earning, anchor) => {
    setPopover((prev) =>
      prev?.earning.reportedDate === earning.reportedDate &&
      prev?.earning.date === earning.date
        ? null
        : { earning, anchor },
    );
  }, []);

  onEarningsClickRef.current = handleEarningsClick;

  useEffect(() => {
    setPopover(null);
  }, [chartData, earnings]);

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
      chartRef.current = createChart(svgElement, {
        chartData,
        earnings,
        width: Math.max(
          0,
          svgRect.width - CHART_MARGIN.left - CHART_MARGIN.right,
        ),
        height: Math.max(
          0,
          svgRect.height - CHART_MARGIN.top - CHART_MARGIN.bottom,
        ),
        colors: readThemeColors(),
        onEarningsClick: (earning, anchor) =>
          onEarningsClickRef.current?.(earning, anchor),
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
  }, [chartData, earnings, mode]);

  return (
    <div className={styles.paper} ref={paperRef}>
      <svg ref={svgRef} className={styles.container} />
      {popover && (
        <EarningsChartPopover
          earning={popover.earning}
          anchor={popover.anchor}
          containerRef={paperRef}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
