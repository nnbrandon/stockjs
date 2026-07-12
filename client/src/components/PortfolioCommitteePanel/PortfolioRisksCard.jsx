import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

import styles from "./PortfolioRisksCard.module.css";

// "Worth knowing" — the portfolio-level risk flags from analyzePortfolioHealth
// (concentration, one-industry tilt, stocks moving in lockstep, big positions
// the committee would sell). Deliberately compact: a short risk list, not a
// dashboard — the verbose health card was removed on purpose. Renders nothing
// when there are no flags.

const MAX_FLAGS = 5;

// Warn flags first, then info; stable within each group.
const severityRank = (f) => (f.severity === "warn" ? 0 : 1);

export default function PortfolioRisksCard({ health }) {
  const flags = (health?.flags ?? [])
    .slice()
    .sort((a, b) => severityRank(a) - severityRank(b))
    .slice(0, MAX_FLAGS);
  if (!flags.length) return null;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <ReportProblemOutlinedIcon sx={{ fontSize: 16 }} />
        <span className={styles.title}>Worth knowing</span>
      </div>
      <ul className={styles.list}>
        {flags.map((flag) => (
          <li key={`${flag.kind}:${(flag.symbols ?? []).join(",")}`} className={styles.item}>
            <span
              className={`${styles.dot} ${flag.severity === "warn" ? styles.dotWarn : styles.dotInfo}`}
            />
            <span className={styles.text}>{flag.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
