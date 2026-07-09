import { useMemo } from "react";
import Tooltip from "@mui/material/Tooltip";
import CardActionArea from "@mui/material/CardActionArea";
import styles from "./NavItemMini.module.css";
import useSymbolChartData from "../../hooks/useSymbolChartData";
import calculateRange from "../../utils/calculateRange";
import prepareSparklineData from "../../utils/prepareSparklineData";

// Collapsed watchlist ticker card — selected adds elevated bg + left accent bar.
const tickerCardSx = (selected) => ({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "1px",
  padding: "7px",
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
      top: 8,
      bottom: 8,
      width: 2,
      backgroundColor: "var(--palette-text-primary)",
      borderRadius: "0 2px 2px 0",
    },
  }),
});

export default function NavItemMini({
  symbol,
  name,
  isSelected,
  onClickSymbol,
}) {
  const range = useMemo(() => calculateRange(7), []);
  const { chartData } = useSymbolChartData(symbol, range);

  const { price, changePct, isUp } = prepareSparklineData(chartData);

  const hasPrice = Number.isFinite(price);
  const hasChange = Number.isFinite(changePct);
  const sign = isUp ? "+" : "−";

  return (
    <Tooltip
      title={name || ""}
      placement="right"
      enterDelay={300}
      disableHoverListener={!name}
    >
      <CardActionArea
        sx={tickerCardSx(isSelected)}
        onClick={() => onClickSymbol(symbol)}
        aria-pressed={isSelected}
        aria-label={name ? `${symbol} — ${name}` : symbol}
      >
        <div className={styles.row}>
          <div className={styles.tickerSymbol}>{symbol}</div>
          {hasPrice && <div className={styles.price}>{price.toFixed(2)}</div>}
        </div>
        {hasChange && (
          <div className={styles.row}>
            <div
              className={`${styles.changePct} ${isUp ? styles.up : styles.down}`}
            >
              {sign}
              {Math.abs(changePct).toFixed(2)}%
            </div>
          </div>
        )}
      </CardActionArea>
    </Tooltip>
  );
}
