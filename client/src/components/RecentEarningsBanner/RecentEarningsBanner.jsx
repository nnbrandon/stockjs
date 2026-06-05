import { useMemo } from "react";
import formatShortNumber from "../../utils/formatShortNumber";
import {
  formatEarningsReportDate,
  formatQuarterEnd,
  fmtSurprisePercent,
  surpriseClass,
} from "../EarningsDetail/EarningsDetailContent";
import styles from "./RecentEarningsBanner.module.css";

const RECENT_DAYS = 14;

function getRecentEarnings(earnings = []) {
  const sorted = [...earnings]
    .filter((e) => e.reportedDate)
    .sort((a, b) => new Date(b.reportedDate) - new Date(a.reportedDate));
  if (!sorted.length) return null;

  const latest = sorted[0];
  const daysSince =
    (Date.now() - new Date(latest.reportedDate).getTime()) /
    (1000 * 60 * 60 * 24);
  if (daysSince > RECENT_DAYS) return null;
  return latest;
}

function fmtEps(v) {
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : null;
}

export default function RecentEarningsBanner({ symbol, earnings }) {
  const recent = useMemo(() => getRecentEarnings(earnings), [earnings]);
  if (!recent) return null;

  const hasEps =
    Number.isFinite(recent.epsActual) || Number.isFinite(recent.epsEstimate);
  const hasRevenue = Number.isFinite(recent.revenueActual);
  const beat = Number.isFinite(recent.surprisePercent)
    ? recent.surprisePercent >= 0
    : null;

  return (
    <div className={styles.banner}>
      <div className={styles.header}>
        <span className={styles.badge}>E</span>
        <div className={styles.headerText}>
          <div className={styles.title}>
            <strong>{symbol}</strong> reported earnings
          </div>
          <div className={styles.meta}>
            {formatEarningsReportDate(recent.reportedDate)}
            {recent.date && (
              <>
                <span className={styles.metaDot}>·</span>
                Quarter ended {formatQuarterEnd(recent.date)}
              </>
            )}
          </div>
        </div>
      </div>

      {(hasEps || hasRevenue) && (
        <div className={styles.metrics}>
          {hasEps && (
            <div className={styles.metric}>
              <span className={styles.metricLabel}>EPS</span>
              <span className={styles.metricValue}>
                {fmtEps(recent.epsActual) ?? "—"}
              </span>
              {Number.isFinite(recent.epsEstimate) && (
                <span className={styles.metricSub}>
                  est. {fmtEps(recent.epsEstimate)}
                </span>
              )}
            </div>
          )}

          {Number.isFinite(recent.surprisePercent) && (
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Surprise</span>
              <span
                className={`${styles.surprisePill} ${surpriseClass(recent.surprisePercent)}`}
              >
                {beat ? "Beat" : "Missed"} {fmtSurprisePercent(recent.surprisePercent)}
              </span>
            </div>
          )}

          {hasRevenue && (
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Revenue</span>
              <span className={styles.metricValue}>
                {formatShortNumber(recent.revenueActual)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
