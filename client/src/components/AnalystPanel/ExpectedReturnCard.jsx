import styles from "./ExpectedReturnCard.module.css";

// "What could it return?" — the engine's rough 5-year yearly-return sketch
// (metrics.expectedReturn): business growth + cash returned to shareholders +
// the valuation drifting back toward normal. Deliberately hedged; never part
// of the score. Renders nothing when the engine produced no estimate
// (unprofitable companies, no growth data).

const r = (n) => Math.round(n);

export default function ExpectedReturnCard({ expectedReturn }) {
  if (!expectedReturn) return null;

  const { lowPct, highPct, growthPct, yieldPct, driftPct, basis, capped } =
    expectedReturn;

  const pieces = [
    `Business growth ~${r(growthPct)}%/yr`,
    `cash returned to you ~${r(yieldPct)}%/yr`,
  ];
  // Drift is only meaningful when a sector band anchored it.
  if (basis?.peMid != null) {
    pieces.push(`valuation drift ${driftPct >= 0 ? "+" : ""}${r(driftPct)}%/yr`);
  }

  return (
    <div className={styles.card} role="note">
      <div className={styles.title}>What could it return?</div>
      <p className={styles.headline}>
        Roughly {r(lowPct)}–{r(highPct)}% a year over the next 5 years,
        including dividends and buybacks.
        {capped
          ? " The raw math came out unusually high, so this is capped — treat it with extra caution."
          : ""}
      </p>
      <p className={styles.pieces}>{pieces.join(" · ")}</p>
      <p className={styles.caveat}>
        Rough math from today&apos;s numbers — real results will differ.
      </p>
    </div>
  );
}
