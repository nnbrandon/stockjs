import { Box, Typography } from "@mui/material";
import { last } from "lodash";
import Stock52WeekRange from "../Stock52WeekRange/Stock52WeekRange";
import TimerangeSelector from "../TimerangeSelector/TimerangeSelector";
import formatShortNumber from "../../utils/formatShortNumber";
import styles from "./StockHeader.module.css";

function PriceChange({ chartData }) {
  if (chartData.length < 2) return null;

  const latest = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];
  const absChange = latest.close - prev.close;
  const pctChange = (absChange / prev.close) * 100;
  const sign = absChange > 0 ? "+" : "";

  const changeClass =
    absChange > 0
      ? styles.priceChangeUp
      : absChange < 0
        ? styles.priceChangeDown
        : "";

  return (
    <span className={`${styles.priceChange} ${changeClass}`}>
      {sign}
      {absChange.toFixed(2)} ({sign}
      {pctChange.toFixed(2)}%)
    </span>
  );
}

function StockHeader({
  selectedSymbol,
  chartData,
  averageVolumePast30Days,
  onRangeChange,
}) {
  if (!selectedSymbol) {
    return (
      <div className={styles.header}>
        <TimerangeSelector onChange={onRangeChange} />
      </div>
    );
  }

  return (
    <div className={styles.header}>
      <h2 className={styles.titleGroup}>
        {chartData[0]?.name} ({chartData[0]?.symbol})
      </h2>

      <div className={styles.priceGroup}>
        <h2>{last(chartData)?.close.toFixed(2)}</h2>
        <PriceChange chartData={chartData} />
      </div>

      <Stock52WeekRange symbol={selectedSymbol} />

      <Box>
        <Typography variant="h8">Average Volume (30 days)</Typography>
        <Box display="flex" justifyContent="space-between">
          {formatShortNumber(averageVolumePast30Days)}
        </Box>
      </Box>

      <TimerangeSelector onChange={onRangeChange} />
    </div>
  );
}

export default StockHeader;
