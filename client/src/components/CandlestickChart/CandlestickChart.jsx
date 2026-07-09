import { useCallback, useEffect, useRef, useState } from "react";
import useResizeObserver from "../../hooks/useResizeObserver";
import Tooltip from "@mui/material/Tooltip";
import ToggleButton from "@mui/material/ToggleButton";
import { createChart, CHART_MARGIN } from "./d3/Chart";
import { useMode } from "../ModeProvider";
import EarningsChartPopover from "./EarningsChartPopover";
import {
  BULLISH_ENGULFING_DESCRIPTION,
  BEARISH_ENGULFING_DESCRIPTION,
} from "../../utils/patternRecognizer";
import styles from "./CandlestickChart.module.css";

// Pill-shaped marker toggles in the chart legend (multi-select).
const legendItemSx = {
  gap: "7px",
  padding: "5px 10px 5px 7px",
  borderRadius: "999px",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-secondary)",
  fontFamily: "inherit",
  fontSize: 12,
  textTransform: "none",
  lineHeight: 1,
  opacity: 0.55,
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    color: "var(--palette-text-primary)",
  },
  "&.Mui-selected": {
    opacity: 1,
    backgroundColor: "var(--palette-bg-elevated)",
    borderColor: "var(--palette-divider-strong)",
    color: "var(--palette-text-primary)",
    "&:hover": { backgroundColor: "var(--palette-bg-elevated)" },
  },
};

const DEFAULT_MARKER_VISIBILITY = {
  earnings: true,
  bullishEngulfing: false,
  bearishEngulfing: false,
};

const LEGEND_ITEMS = [
  {
    key: "earnings",
    label: "Earnings",
    kind: "pentagon",
    sample: "E",
    tone: "success",
  },
  {
    key: "bullishEngulfing",
    label: "Bullish engulfing",
    kind: "circle",
    arrow: "↑",
    tone: "success",
    tooltip: BULLISH_ENGULFING_DESCRIPTION,
  },
  {
    key: "bearishEngulfing",
    label: "Bearish engulfing",
    kind: "circle",
    arrow: "↓",
    tone: "error",
    tooltip: BEARISH_ENGULFING_DESCRIPTION,
  },
];

function LegendBadge({ kind, sample, arrow, tone }) {
  const toneClass =
    tone === "error" ? styles.legendBadgeError : styles.legendBadgeSuccess;

  if (kind === "circle") {
    return (
      <span className={`${styles.legendBadgeCircle} ${toneClass}`} aria-hidden>
        <span className={styles.legendLetter}>B</span>
        <span className={styles.legendArrow}>{arrow}</span>
      </span>
    );
  }

  return (
    <span className={`${styles.legendBadgeSvgWrap} ${toneClass}`} aria-hidden>
      <svg
        className={styles.legendBadgeSvg}
        viewBox="-8.5 -17 17 17"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M 0,-17 L 8.5,-6.5 L 8.5,0 L -8.5,0 L -8.5,-6.5 Z"
          fill="var(--palette-bg-paper)"
          stroke="currentColor"
          strokeWidth="1"
        />
        <text
          x="0"
          y="-7.1"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          fontSize="10"
          fontWeight="700"
        >
          {sample}
        </text>
      </svg>
    </span>
  );
}

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
  const [markerVisibility, setMarkerVisibility] = useState(
    DEFAULT_MARKER_VISIBILITY,
  );

  const handleEarningsClick = useCallback((earning, anchor) => {
    setPopover((prev) =>
      prev?.earning.reportedDate === earning.reportedDate &&
      prev?.earning.date === earning.date
        ? null
        : { earning, anchor },
    );
  }, []);

  const toggleMarker = useCallback((key) => {
    setMarkerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  onEarningsClickRef.current = handleEarningsClick;

  useEffect(() => {
    setPopover(null);
  }, [chartData, earnings]);

  useEffect(
    () => () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    },
    [chartData, earnings, mode, markerVisibility],
  );

  useResizeObserver(svgRef, () => {
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
      markerVisibility,
      onEarningsClick: (earning, anchor) =>
        onEarningsClickRef.current?.(earning, anchor),
    });
  }, [chartData, earnings, mode, markerVisibility]);

  return (
    <div className={styles.paper} ref={paperRef}>
      <div className={styles.legend} role="group" aria-label="Chart markers">
        {LEGEND_ITEMS.map((item) => {
          const { key, label, tooltip, ...badgeProps } = item;
          const active = markerVisibility[key];
          const button = (
            <ToggleButton
              value={key}
              selected={active}
              onChange={() => toggleMarker(key)}
              disableRipple
              sx={legendItemSx}
            >
              <LegendBadge {...badgeProps} />
              <span className={styles.legendLabel}>{label}</span>
            </ToggleButton>
          );

          if (!tooltip) return <span key={key}>{button}</span>;

          return (
            <Tooltip key={key} title={tooltip} arrow placement="top">
              {button}
            </Tooltip>
          );
        })}
      </div>
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
