import formatShortNumber from "../../utils/formatShortNumber";
import styles from "./EarningsDetailContent.module.css";

export function formatEarningsReportDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatQuarterEnd(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export function fmtEps(v) {
  return Number.isFinite(v) ? v.toFixed(3) : "—";
}

export function surpriseClass(v) {
  if (!Number.isFinite(v)) return "";
  return v >= 0 ? styles.surprise_pos : styles.surprise_neg;
}

export function fmtSurprisePercent(v) {
  if (!Number.isFinite(v)) return null;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtSurpriseAbsolute(actual, estimate) {
  if (!Number.isFinite(actual) || !Number.isFinite(estimate)) return null;
  const diff = actual - estimate;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(3)}`;
}

function fmtRevenueSurprise(actual, estimate) {
  if (!Number.isFinite(actual) || !Number.isFinite(estimate)) return null;
  const diff = actual - estimate;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${formatShortNumber(diff)}`;
}

function fmtRevenueSurprisePercent(actual, estimate) {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(estimate) ||
    estimate === 0
  ) {
    return null;
  }
  const pct = ((actual - estimate) / Math.abs(estimate)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function hasEarningsDetail(data) {
  if (!data) return false;
  return (
    data.reportedDate != null ||
    Number.isFinite(data.epsActual) ||
    Number.isFinite(data.epsEstimate) ||
    Number.isFinite(data.revenueActual)
  );
}

export default function EarningsDetailContent({
  date,
  reportedDate,
  dilutedEPS,
  epsActual,
  epsEstimate,
  epsDifference,
  surprisePercent,
  revenueActual,
  revenueEstimate,
  netIncomeActual,
}) {
  const epsSurpriseAbs =
    Number.isFinite(epsDifference)
      ? `${epsDifference >= 0 ? "+" : ""}${epsDifference.toFixed(3)}`
      : fmtSurpriseAbsolute(epsActual, epsEstimate);

  const revenueSurpriseAbs = fmtRevenueSurprise(
    revenueActual,
    revenueEstimate,
  );
  const revenueSurprisePct = fmtRevenueSurprisePercent(
    revenueActual,
    revenueEstimate,
  );

  const showEarnings =
    Number.isFinite(dilutedEPS) ||
    Number.isFinite(epsActual) ||
    Number.isFinite(epsEstimate);

  const showRevenue =
    Number.isFinite(revenueActual) || Number.isFinite(revenueEstimate);

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={styles.badge}>E</span>
        <span className={styles.title}>Earnings &amp; Revenue</span>
      </div>

      {(reportedDate || date) && (
        <div className={styles.meta}>
          {reportedDate && <div>Reported {formatEarningsReportDate(reportedDate)}</div>}
          {date && <div>Period ending {formatQuarterEnd(date)}</div>}
        </div>
      )}

      {showEarnings && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Earnings</div>
          {Number.isFinite(dilutedEPS) && (
            <div className={styles.row}>
              <span>Standardized</span>
              <span>{fmtEps(dilutedEPS)}</span>
            </div>
          )}
          {Number.isFinite(epsActual) && (
            <div className={styles.row}>
              <span>Reported</span>
              <span>{fmtEps(epsActual)}</span>
            </div>
          )}
          {Number.isFinite(epsEstimate) && (
            <div className={styles.row}>
              <span>Estimate</span>
              <span>{fmtEps(epsEstimate)}</span>
            </div>
          )}
          {(epsSurpriseAbs || Number.isFinite(surprisePercent)) && (
            <div className={styles.row}>
              <span>Surprise</span>
              <span className={surpriseClass(surprisePercent ?? 0)}>
                {epsSurpriseAbs && <span>{epsSurpriseAbs}</span>}
                {epsSurpriseAbs && Number.isFinite(surprisePercent) && (
                  <span className={styles.surprisePct}>
                    {" "}
                    ({fmtSurprisePercent(surprisePercent)})
                  </span>
                )}
                {!epsSurpriseAbs && Number.isFinite(surprisePercent) && (
                  <span>{fmtSurprisePercent(surprisePercent)}</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {showRevenue && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Revenue</div>
          {Number.isFinite(revenueActual) && (
            <div className={styles.row}>
              <span>Reported</span>
              <span>{formatShortNumber(revenueActual)}</span>
            </div>
          )}
          {Number.isFinite(revenueEstimate) && (
            <div className={styles.row}>
              <span>Estimate</span>
              <span>{formatShortNumber(revenueEstimate)}</span>
            </div>
          )}
          {(revenueSurpriseAbs || revenueSurprisePct) && (
            <div className={styles.row}>
              <span>Surprise</span>
              <span
                className={surpriseClass(
                  Number.isFinite(revenueActual) &&
                    Number.isFinite(revenueEstimate)
                    ? revenueActual - revenueEstimate
                    : 0,
                )}
              >
                {revenueSurpriseAbs && <span>{revenueSurpriseAbs}</span>}
                {revenueSurpriseAbs && revenueSurprisePct && (
                  <span className={styles.surprisePct}>
                    {" "}
                    ({revenueSurprisePct})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {Number.isFinite(netIncomeActual) && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Profit</div>
          <div className={styles.row}>
            <span>Reported</span>
            <span>{formatShortNumber(netIncomeActual)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
