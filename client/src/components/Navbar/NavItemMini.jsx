import { useMemo } from "react";
import Tooltip from "@mui/material/Tooltip";
import styles from "./NavItemMini.module.css";
import useSymbolChartData from "../../hooks/useSymbolChartData";
import calculateRange from "../../utils/calculateRange";
import prepareSparklineData from "../../utils/prepareSparklineData";

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
      <button
        type="button"
        className={`${styles.tickerCard} ${isSelected ? styles.selected : ""}`}
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
      </button>
    </Tooltip>
  );
}
