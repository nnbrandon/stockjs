import { Skeleton } from "@mui/material";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

function TickerSparkline({ data, isUp, height = 40, isLoading = false }) {
  if (isLoading) {
    return (
      <Skeleton
        variant="rectangular"
        width="100%"
        height={height}
        sx={{ borderRadius: 1 }}
      />
    );
  }

  const color = isUp ? "#22c55e" : "#ef4444";

  return (
    <SparkLineChart
      data={data}
      height={height}
      curve="linear"
      color={color}
      showHighlight={false}
      showTooltip={false}
      margin={{ top: 2, bottom: 2, left: 0, right: 0 }}
      sx={{
        "& .MuiLineElement-root": {
          strokeWidth: 1.5,
        },
      }}
    />
  );
}

export default TickerSparkline;
