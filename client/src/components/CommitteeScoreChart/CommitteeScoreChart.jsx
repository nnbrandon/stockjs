import { LineChart } from "@mui/x-charts/LineChart";

// "2026-07-08" -> "07-08" for compact x-axis ticks.
function fmtTick(day) {
  if (typeof day !== "string") return "";
  const parts = day.split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : day;
}

/**
 * Committee composite score over time, with dated x-axis labels. Y-axis is
 * hidden (the numbers live in the tooltip); the line auto-scales to the data
 * so day-to-day movement stays visible.
 */
function CommitteeScoreChart({ series, height = 128 }) {
  const days = series.map((p) => p.day);
  const values = series.map((p) => Math.round(p.composite));
  const isUp = values.at(-1) >= values[0];
  const color = isUp ? "#22c55e" : "#ef4444";

  // Pad the scale so the line never sits flush against the top/bottom edges
  // (and so a perfectly flat series still renders as a centered line).
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(1, Math.round((hi - lo) * 0.25));

  // Show ~4 evenly spaced date labels, always including the last point.
  const step = Math.max(1, Math.ceil(days.length / 4));
  const tickDays = days.filter(
    (_, i) => i % step === 0 || i === days.length - 1,
  );

  return (
    <LineChart
      height={height}
      margin={{ top: 10, right: 10, bottom: 24, left: 10 }}
      series={[
        {
          data: values,
          color,
          curve: "linear",
          area: true,
          showMark: series.length <= 8,
          valueFormatter: (v, { dataIndex }) =>
            `${v}  ·  ${days[dataIndex]}`,
        },
      ]}
      xAxis={[
        {
          data: days,
          scaleType: "point",
          valueFormatter: fmtTick,
          tickInterval: tickDays,
          disableLine: true,
          disableTicks: true,
          tickLabelStyle: {
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fill: "var(--palette-text-disabled)",
          },
        },
      ]}
      yAxis={[{ min: lo - pad, max: hi + pad }]}
      sx={{
        "& .MuiChartsAxis-left": { display: "none" },
        "& .MuiAreaElement-root": { fillOpacity: 0.1 },
        "& .MuiLineElement-root": { strokeWidth: 1.75 },
      }}
    />
  );
}

export default CommitteeScoreChart;
