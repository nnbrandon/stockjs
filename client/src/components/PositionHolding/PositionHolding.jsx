import { Skeleton } from "@mui/material";
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

function BarStat({ label, value, sub, loading, valueClassName, showSubWhenLoading }) {
  return (
    <div className={styles.barStat}>
      <div className={styles.barLabel}>{label}</div>
      {loading ? (
        <>
          <Skeleton
            variant="text"
            width="65%"
            height={22}
            className={styles.barSkeletonValue}
          />
          {(showSubWhenLoading || sub !== undefined) && (
            <Skeleton
              variant="text"
              width="40%"
              height={14}
              className={styles.barSkeletonSub}
            />
          )}
        </>
      ) : (
        <>
          {value !== undefined && (
            <div className={`${styles.barValue} ${valueClassName ?? ""}`}>
              {value}
            </div>
          )}
          {sub !== undefined && (
            <div className={`${styles.barSub} ${valueClassName ?? ""}`}>{sub}</div>
          )}
        </>
      )}
    </div>
  );
}

function PositionBar({ position, metrics, isLoading }) {
  const totalUp = metrics?.totalGainLoss >= 0;
  const todayUp = metrics?.todayGainLoss >= 0;
  const accentClass = metrics
    ? totalUp
      ? styles.barWrapUp
      : styles.barWrapDown
    : "";

  return (
    <div className={`${styles.barWrap} ${accentClass}`}>
      <div className={styles.barRow}>
        <BarStat
          label="Shares"
          loading={isLoading}
          value={
            position.quantity.toLocaleString("en-US", {
              maximumFractionDigits: 3,
            })
          }
        />
        <BarStat
          label="Avg cost basis"
          loading={isLoading}
          value={formatDollars(position.averageCostBasis)}
        />
        <BarStat
          label="Position value"
          loading={isLoading}
          value={metrics ? formatDollars(metrics.currentValue) : "—"}
        />
        <BarStat
          label="Total gain/loss"
          loading={isLoading}
          showSubWhenLoading
          value={
            metrics
              ? formatDollars(metrics.totalGainLoss, { signed: true })
              : "—"
          }
          sub={
            metrics
              ? formatPercent(metrics.totalGainLossPct, {
                  signed: true,
                  decimals: 1,
                })
              : undefined
          }
          valueClassName={
            metrics ? (totalUp ? styles.up : styles.down) : undefined
          }
        />
        <BarStat
          label="Today's gain/loss"
          loading={isLoading}
          value={
            metrics
              ? formatDollars(metrics.todayGainLoss, { signed: true })
              : "—"
          }
          valueClassName={
            metrics ? (todayUp ? styles.up : styles.down) : undefined
          }
        />
      </div>
    </div>
  );
}

function HoldingGrid({
  position,
  metrics,
  isLoading,
  showTodayGainLoss,
  compact,
  stackedGainLoss = false,
  gridClassName,
}) {
  const totalUp = metrics?.totalGainLoss >= 0;
  const todayUp = metrics?.todayGainLoss >= 0;

  return (
    <div className={gridClassName}>
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
                  stacked={stackedGainLoss || compact}
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
                    stacked={stackedGainLoss || compact}
                  />
                ) : (
                  "—"
                )}
              </span>
            )}
          </div>
        )}
    </div>
  );
}

export default function PositionHolding({
  position,
  metrics,
  isLoading = false,
  title = "Your holding",
  showTodayGainLoss = false,
  compact = false,
  variant = "card",
  className,
}) {
  if (!position) return null;

  if (variant === "bar") {
    return (
      <PositionBar
        position={position}
        metrics={metrics}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className={`${styles.card} ${compact ? styles.cardCompact : ""} ${className ?? ""}`}>
      <div className={styles.head}>{title}</div>
      <HoldingGrid
        position={position}
        metrics={metrics}
        isLoading={isLoading}
        showTodayGainLoss={showTodayGainLoss}
        compact={compact}
        gridClassName={gridClass({ compact, showTodayGainLoss })}
      />
    </div>
  );
}
