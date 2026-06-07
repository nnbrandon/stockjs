import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { last } from "lodash";
import PositionStatRow from "../StatRow/PositionStatRow";
import styles from "./StockHeader.module.css";

function PriceChange({ chartData }) {
  if (!chartData || chartData.length < 2) return null;

  const latest = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];
  const absChange = latest.close - prev.close;
  const pctChange = (absChange / prev.close) * 100;

  const isUp = absChange >= 0;
  const sign = isUp ? "+" : "−";
  const Arrow = isUp ? KeyboardArrowUpIcon : KeyboardArrowDownIcon;

  return (
    <div className={`${styles.changePill} ${isUp ? styles.up : styles.down}`}>
      <Arrow className={styles.arrow} />
      {sign}
      {Math.abs(absChange).toFixed(2)} ({sign}
      {Math.abs(pctChange).toFixed(2)}%)
    </div>
  );
}

function StockHeader({ selectedSymbol, chartData, position, isLoading, children }) {
  if (!selectedSymbol) return null;

  const company = chartData[0]?.name;
  const symbol = chartData[0]?.symbol ?? selectedSymbol;
  const latest = last(chartData);

  const hasHolding = Boolean(position);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.tickerHeadline}>
            <h1 className={styles.companyName}>{company || symbol}</h1>
            {company && <span className={styles.chip}>{symbol}</span>}
          </div>

          {children && <div className={styles.headerActions}>{children}</div>}
        </div>

        {latest && (
          <div className={styles.priceRow}>
            <div className={styles.priceGroup}>
              <div className={styles.priceMain}>
                <span className={styles.priceCurrency}>$</span>
                {latest.close.toFixed(2)}
              </div>
              <PriceChange chartData={chartData} />
            </div>
          </div>
        )}

        {hasHolding && (
          <PositionStatRow
            position={position}
            chartData={chartData}
            isLoading={isLoading}
            variant="bar"
          />
        )}
      </header>
    </div>
  );
}

export default StockHeader;
