import { useEffect, useState } from "react";
import { Skeleton } from "@mui/material";
import { last } from "lodash";
import { get52WeekStats } from "../../db";
import formatShortNumber from "../../utils/formatShortNumber";
import styles from "./StatRow.module.css";
import PositionStatRow from "./PositionStatRow";

const fmt = (n, decimals = 2) =>
  Number.isFinite(n) ? n.toFixed(decimals) : "—";

function Stat({ label, value, sub, children, loading }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      {loading ? (
        <>
          <Skeleton
            variant="text"
            width="65%"
            height={22}
            className={styles.skeletonValue}
          />
          <Skeleton
            variant="text"
            width="45%"
            height={14}
            className={styles.skeletonSub}
          />
        </>
      ) : (
        <>
          {value !== undefined && (
            <div className={styles.statValue}>{value}</div>
          )}
          {children}
          {sub && <div className={styles.statSub}>{sub}</div>}
        </>
      )}
    </div>
  );
}

function RangeStat({ stats, loading }) {
  if (loading) {
    return (
      <div className={styles.stat}>
        <div className={styles.statLabel}>52-Week Range</div>
        <Skeleton
          variant="rounded"
          height={4}
          className={styles.skeletonRange}
        />
        <Skeleton variant="text" width="80%" height={14} />
      </div>
    );
  }

  if (
    !stats ||
    !Number.isFinite(stats.low52) ||
    !Number.isFinite(stats.high52)
  ) {
    return <Stat label="52-Week Range" value="—" />;
  }

  const { low52, high52, current } = stats;
  const pct = ((current - low52) / (high52 - low52)) * 100;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <Stat label="52-Week Range">
      <div className={styles.rangeTrack}>
        <div className={styles.rangeMarker} style={{ left: `${clamped}%` }} />
      </div>
      <div className={styles.rangeExtremes}>
        <span>${fmt(low52)}</span>
        <span>${fmt(high52)}</span>
      </div>
    </Stat>
  );
}

function StatRow({
  symbol,
  chartData,
  averageVolumePast30Days,
  position,
  isLoading,
}) {
  const [weekStats, setWeekStats] = useState(null);

  useEffect(() => {
    if (!symbol) {
      setWeekStats(null);
      return;
    }
    get52WeekStats(symbol).then(setWeekStats);
  }, [symbol]);

  if (!symbol) return null;

  const latest = last(chartData) || {};

  return (
    <div className={styles.statBlock}>
      <div className={styles.statWrap}>
        <div className={styles.statRow}>
          <Stat
            label="Open"
            value={`$${fmt(latest.open)}`}
            sub="latest session"
            loading={isLoading}
          />
          <Stat
            label="Day Range"
            value={`${fmt(latest.low)} — ${fmt(latest.high)}`}
            sub="low / high"
            loading={isLoading}
          />
          <Stat
            label="Volume"
            value={
              Number.isFinite(latest.volume)
                ? formatShortNumber(latest.volume)
                : "—"
            }
            sub={
              Number.isFinite(averageVolumePast30Days)
                ? `avg ${formatShortNumber(averageVolumePast30Days)} past 30 days`
                : undefined
            }
            loading={isLoading}
          />
          <RangeStat stats={weekStats} loading={isLoading} />
        </div>
      </div>
      <PositionStatRow
        position={position}
        chartData={chartData}
        isLoading={isLoading}
      />
    </div>
  );
}

export default StatRow;
