import { useEffect, useState } from "react";
import styles from "./NavItem.module.css";
import useSymbolData from "../../hooks/useSymbolData";
import TickerSparkline from "../SparklineChart/SparklineChart";
import calculateRange from "../../utils/calculateRange";
import prepareSparklineData from "../../utils/prepareSparklineData";
import { useRefreshSignal } from "../../hooks/useRefreshSignal";

export default function NavItem({ symbol, name, isSelected, onClickSymbol }) {
  // Subscribe to refresh signals for this symbol
  const refreshVersion = useRefreshSignal(symbol);

  const [range, setRange] = useState(calculateRange(7));
  const { chartData, isLoading } = useSymbolData(symbol, range);

  const sparklineData = prepareSparklineData(chartData);

  useEffect(() => {
    // Recalculate the range whenever the refresh version changes
    setRange(calculateRange(7));
  }, [refreshVersion]);

  const { price, changePct, isUp } = sparklineData;
  const hasPrice = Number.isFinite(price);
  const hasChange = Number.isFinite(changePct);
  const sign = isUp ? "+" : "−";

  return (
    <button
      type="button"
      className={`${styles.tickerCard} ${isSelected ? styles.selected : ""}`}
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
        isLoading={isLoading}
      />
    </button>
  );
}
