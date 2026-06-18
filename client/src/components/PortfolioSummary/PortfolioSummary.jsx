import { useMemo, useState } from "react";
import usePortfolioSummary from "../../hooks/usePortfolioSummary";
import {
  formatDollars,
  formatPercent,
} from "../../utils/computePositionMetrics";
import useExtendedHoursQuote from "../../hooks/useExtendedHoursQuote";
import styles from "./PortfolioSummary.module.css";

function AfterHoursTag({ symbol, symbols }) {
  const extended = useExtendedHoursQuote(symbol, symbols);
  if (!extended || !Number.isFinite(extended.price)) return null;

  const isUp = (extended.change ?? 0) >= 0;
  return (
    <span className={styles.afterHours} title={`${extended.label} price`}>
      AH {formatDollars(extended.price)}
      {Number.isFinite(extended.changePercent) && (
        <span className={isUp ? styles.up : styles.down}>
          {" "}
          ({formatPercent(extended.changePercent, { signed: true })})
        </span>
      )}
    </span>
  );
}

const SORT_KEYS = {
  symbol: "symbol",
  lastPrice: "lastPrice",
  todayGainLoss: "todayGainLoss",
  totalGainLoss: "totalGainLoss",
  currentValue: "currentValue",
  avgCostBasis: "avgCostBasis",
};

function getSortValue(row, key) {
  const metrics = row.metrics;
  switch (key) {
    case SORT_KEYS.symbol:
      return row.quantity ?? null;
    case SORT_KEYS.lastPrice:
      return metrics?.lastPrice ?? null;
    case SORT_KEYS.todayGainLoss:
      return metrics?.todayGainLoss ?? null;
    case SORT_KEYS.totalGainLoss:
      return metrics?.totalGainLoss ?? null;
    case SORT_KEYS.currentValue:
      return metrics?.currentValue ?? null;
    case SORT_KEYS.avgCostBasis:
      return row.averageCostBasis ?? null;
    default:
      return null;
  }
}

function compareHoldings(a, b, sortKey, direction) {
  const aVal = getSortValue(a, sortKey);
  const bVal = getSortValue(b, sortKey);
  const mult = direction === "asc" ? 1 : -1;

  if (aVal == null && bVal == null) return a.symbol.localeCompare(b.symbol);
  if (aVal == null) return 1;
  if (bVal == null) return -1;

  if (typeof aVal === "string") {
    const cmp = aVal.localeCompare(bVal);
    return cmp !== 0 ? cmp * mult : a.symbol.localeCompare(b.symbol);
  }

  const diff = aVal - bVal;
  return diff !== 0 ? diff * mult : a.symbol.localeCompare(b.symbol);
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
  align = "left",
}) {
  const active = activeKey === sortKey;
  const icon = (
    <span className={styles.sortIcon} aria-hidden>
      {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  return (
    <th className={className}>
      <button
        type="button"
        className={`${styles.sortBtn} ${align === "right" ? styles.sortBtnRight : ""} ${active ? styles.sortBtnActive : ""}`}
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      >
        <span className={styles.sortLabel}>{label}</span>
        {icon}
      </button>
    </th>
  );
}

function GainLoss({ label, dollars, percent, loading }) {
  if (loading) {
    return (
      <div className={styles.stat}>
        <div className={styles.statLabel}>{label}</div>
        <div className={styles.skeleton} />
      </div>
    );
  }

  const isUp = dollars >= 0;
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statValue} ${isUp ? styles.up : styles.down}`}>
        {formatDollars(dollars, { signed: true })}
      </div>
      <div className={`${styles.statSub} ${isUp ? styles.up : styles.down}`}>
        {formatPercent(percent, { signed: true })}
      </div>
    </div>
  );
}

function GainLossCell({ dollars, percent }) {
  const isUp = dollars >= 0;
  return (
    <span className={isUp ? styles.up : styles.down}>
      {formatDollars(dollars, { signed: true })}
      <span className={styles.pct}>
        {" "}
        ({formatPercent(percent, { signed: true })})
      </span>
    </span>
  );
}

function LastPriceCell({ price, change }) {
  const isUp = change >= 0;
  const hasChange = Number.isFinite(change);

  return (
    <span className={styles.lastPriceCell}>
      {formatDollars(price)}
      {hasChange && (
        <span className={`${styles.pct} ${isUp ? styles.up : styles.down}`}>
          {" "}
          ({formatDollars(change, { signed: true })})
        </span>
      )}
    </span>
  );
}

function PortfolioSummary({ positions, onSelectSymbol }) {
  const { summary, isLoading, tradeablePositions, tradeableCount } =
    usePortfolioSummary(positions);
  const [sortKey, setSortKey] = useState(SORT_KEYS.totalGainLoss);
  const [sortDirection, setSortDirection] = useState("desc");

  const holdings = summary?.holdings ?? tradeablePositions;

  // One shared symbol list so every row's after-hours tag hits a single batched
  // quote query (React Query dedupes by this key).
  const holdingSymbols = useMemo(
    () => holdings.map((h) => h.symbol),
    [holdings],
  );

  const sortedHoldings = useMemo(
    () =>
      [...holdings].sort((a, b) => compareHoldings(a, b, sortKey, sortDirection)),
    [holdings, sortKey, sortDirection],
  );

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  if (!tradeableCount) return null;

  return (
    <section className={styles.section} aria-label="Portfolio summary">
      <div className={styles.header}>
        <h2 className={styles.title}>Portfolio</h2>
        <span className={styles.count}>
          {tradeableCount} holding{tradeableCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className={styles.totals}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Current value</div>
          <div className={styles.statValue}>
            {isLoading ? "—" : formatDollars(summary?.totalValue)}
          </div>
        </div>
        <GainLoss
          label="Total gain/loss"
          dollars={summary?.totalGainLoss ?? 0}
          percent={summary?.totalGainLossPct ?? 0}
          loading={isLoading}
        />
        <GainLoss
          label="Today's gain/loss"
          dollars={summary?.todayGainLoss ?? 0}
          percent={summary?.todayGainLossPct ?? 0}
          loading={isLoading}
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <SortHeader
                label="Symbol"
                sortKey={SORT_KEYS.symbol}
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                className={styles.symbolCol}
              />
              <SortHeader
                label="Last price"
                sortKey={SORT_KEYS.lastPrice}
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                className={`${styles.numCol} ${styles.lastPriceCol}`}
                align="right"
              />
              <SortHeader
                label="Today's gain/loss"
                sortKey={SORT_KEYS.todayGainLoss}
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                className={styles.numCol}
                align="right"
              />
              <SortHeader
                label="Total gain/loss"
                sortKey={SORT_KEYS.totalGainLoss}
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                className={styles.numCol}
                align="right"
              />
              <SortHeader
                label="Current value"
                sortKey={SORT_KEYS.currentValue}
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                className={styles.numCol}
                align="right"
              />
              <SortHeader
                label="Avg cost basis"
                sortKey={SORT_KEYS.avgCostBasis}
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
                className={styles.numCol}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((row) => {
              const metrics = row.metrics;
              return (
                <tr key={row.symbol}>
                  <td className={styles.symbolCol}>
                    <button
                      type="button"
                      className={styles.symbolBtn}
                      onClick={() => onSelectSymbol(row.symbol)}
                    >
                      {row.symbol}
                    </button>
                    <span className={styles.shares}>
                      {row.quantity.toLocaleString("en-US", {
                        maximumFractionDigits: 3,
                      })}{" "}
                      sh
                    </span>
                  </td>
                  <td className={`${styles.numCol} ${styles.lastPriceCol}`}>
                    {metrics ? (
                      <>
                        <LastPriceCell
                          price={metrics.lastPrice}
                          change={metrics.lastPriceChange}
                        />
                        <AfterHoursTag
                          symbol={row.symbol}
                          symbols={holdingSymbols}
                        />
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={styles.numCol}>
                    {metrics ? (
                      <GainLossCell
                        dollars={metrics.todayGainLoss}
                        percent={metrics.todayGainLossPct}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={styles.numCol}>
                    {metrics ? (
                      <GainLossCell
                        dollars={metrics.totalGainLoss}
                        percent={metrics.totalGainLossPct}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={styles.numCol}>
                    {metrics ? formatDollars(metrics.currentValue) : "—"}
                  </td>
                  <td className={styles.numCol}>
                    {formatDollars(row.averageCostBasis)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default PortfolioSummary;
