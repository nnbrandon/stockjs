import { useMemo } from "react";
import styles from "./NavItem.module.css";
import useSymbolChartData from "../../hooks/useSymbolChartData";
import TickerSparkline from "../SparklineChart/SparklineChart";
import calculateRange from "../../utils/calculateRange";
import prepareSparklineData from "../../utils/prepareSparklineData";

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
        isLoading={showSparklineLoading}
      />
    </button>
  );
}
