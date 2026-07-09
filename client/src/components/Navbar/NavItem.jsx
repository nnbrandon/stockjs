import { useMemo } from "react";
import CardActionArea from "@mui/material/CardActionArea";
import styles from "./NavItem.module.css";
import useSymbolChartData from "../../hooks/useSymbolChartData";
import TickerSparkline from "../SparklineChart/SparklineChart";
import calculateRange from "../../utils/calculateRange";
import prepareSparklineData from "../../utils/prepareSparklineData";

// Watchlist ticker card — selected state adds an elevated bg + left accent bar.
const tickerCardSx = (selected) => ({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "2px",
  padding: "12px 10px",
  borderRadius: "var(--shape-radius)",
  textAlign: "left",
  color: "inherit",
  "&:hover": { backgroundColor: "var(--palette-hover-overlay)" },
  ...(selected && {
    backgroundColor: "var(--palette-bg-elevated)",
    "&:hover": { backgroundColor: "var(--palette-bg-elevated)" },
    "&::before": {
      content: '""',
      position: "absolute",
      left: 0,
      top: 14,
      bottom: 14,
      width: 2,
      backgroundColor: "var(--palette-text-primary)",
      borderRadius: "0 2px 2px 0",
    },
  }),
});

export default function NavItem({
  symbol,
  name,
  isSelected,
  onClickSymbol,
}) {
  const range = useMemo(() => calculateRange(7), []);
  const { chartData, isLoading } = useSymbolChartData(symbol, range);

  const sparklineData = prepareSparklineData(chartData);
  const showSparklineLoading = isLoading && sparklineData.data.length === 0;

  const { price, changePct, isUp } = sparklineData;
  const hasPrice = Number.isFinite(price);
  const hasChange = Number.isFinite(changePct);
  const sign = isUp ? "+" : "−";

  return (
    <CardActionArea
      sx={tickerCardSx(isSelected)}
      onClick={() => onClickSymbol(symbol)}
      aria-pressed={isSelected}
    >
      <div className={styles.row}>
        <div className={styles.tickerSymbol}>{symbol}</div>
        {hasPrice && <div className={styles.price}>{price.toFixed(2)}</div>}
      </div>
      {(name || hasChange) && (
        <div className={styles.row}>
          {name && <div className={styles.tickerName}>{name}</div>}
          {hasChange && (
            <div
              className={`${styles.changePct} ${isUp ? styles.up : styles.down}`}
            >
              {sign}
              {Math.abs(changePct).toFixed(2)}%
            </div>
          )}
        </div>
      )}
      <TickerSparkline
        data={sparklineData.data}
        isUp={isUp}
        isLoading={showSparklineLoading}
      />
    </CardActionArea>
  );
}
