import {
  formatDollars,
  formatPercent,
} from "../../utils/computePositionMetrics";
import styles from "./PositionHolding.module.css";

function GainLossValue({ dollars, percent, stacked = false }) {
  const isUp = dollars >= 0;

  if (stacked) {
    return (
      <span className={`${styles.gainLossStack} ${isUp ? styles.up : styles.down}`}>
        <span className={styles.gainLossPrimary}>
          {formatDollars(dollars, { signed: true })}
        </span>
        <span className={styles.gainLossSub}>
          {formatPercent(percent, { signed: true })}
        </span>
      </span>
    );
  }

  return (
    <span className={isUp ? styles.up : styles.down}>
      {formatDollars(dollars, { signed: true })}{" "}
      ({formatPercent(percent, { signed: true })})
    </span>
  );
}

function SkeletonValue() {
  return <div className={styles.skeleton} />;
}

function gridClass({ compact, showTodayGainLoss }) {
  if (compact) {
    return showTodayGainLoss ? styles.gridCompactFive : styles.gridCompact;
  }
  return showTodayGainLoss ? styles.gridFive : styles.grid;
}

export default function PositionHolding({
  position,
  metrics,
  isLoading = false,
  title = "Your holding",
  showTodayGainLoss = false,
  compact = false,
  className,
}) {
  if (!position) return null;

  const totalUp = metrics?.totalGainLoss >= 0;
  const todayUp = metrics?.todayGainLoss >= 0;

  return (
    <div className={`${styles.card} ${compact ? styles.cardCompact : ""} ${className ?? ""}`}>
      <div className={styles.head}>{title}</div>
      <div className={gridClass({ compact, showTodayGainLoss })}>
        <div className={styles.item}>
          <span className={styles.label}>Shares</span>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <span className={styles.value}>
              {position.quantity.toLocaleString("en-US", {
                maximumFractionDigits: 3,
              })}
            </span>
          )}
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Avg cost basis</span>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <span className={styles.value}>
              {formatDollars(position.averageCostBasis)}
            </span>
          )}
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Current value</span>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <span className={styles.value}>
              {metrics ? formatDollars(metrics.currentValue) : "—"}
            </span>
          )}
        </div>
        <div className={styles.item}>
          <span className={styles.label}>Total gain/loss</span>
          {isLoading ? (
            <SkeletonValue />
          ) : (
            <span
              className={`${styles.value} ${metrics ? (totalUp ? styles.up : styles.down) : ""}`}
            >
              {metrics ? (
                <GainLossValue
                  dollars={metrics.totalGainLoss}
                  percent={metrics.totalGainLossPct}
                  stacked={compact}
                />
              ) : (
                "—"
              )}
            </span>
          )}
        </div>
        {showTodayGainLoss && (
          <div className={styles.item}>
            <span className={styles.label}>Today&apos;s gain/loss</span>
            {isLoading ? (
              <SkeletonValue />
            ) : (
              <span
                className={`${styles.value} ${metrics ? (todayUp ? styles.up : styles.down) : ""}`}
              >
                {metrics ? (
                  <GainLossValue
                    dollars={metrics.todayGainLoss}
                    percent={metrics.todayGainLossPct}
                    stacked={compact}
                  />
                ) : (
                  "—"
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
