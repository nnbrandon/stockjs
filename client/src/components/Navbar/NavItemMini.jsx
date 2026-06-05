import { useEffect, useState } from "react";
import Tooltip from "@mui/material/Tooltip";
import styles from "./NavItemMini.module.css";
import useSymbolData from "../../hooks/useSymbolData";
import calculateRange from "../../utils/calculateRange";
import prepareSparklineData from "../../utils/prepareSparklineData";
import { useRefreshSignal } from "../../hooks/useRefreshSignal";

export default function NavItemMini({
  symbol,
  name,
  isSelected,
  onClickSymbol,
}) {
  const refreshVersion = useRefreshSignal(symbol);

  const [range, setRange] = useState(calculateRange(7));
  const { chartData } = useSymbolData(symbol, range);

  const { price, changePct, isUp } = prepareSparklineData(chartData);

  useEffect(() => {
    setRange(calculateRange(7));
  }, [refreshVersion]);

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
