import styles from "./PortfolioHealthCard.module.css";

const fmtPct = (n, d = 0) => (Number.isFinite(n) ? `${n.toFixed(d)}%` : "—");

function scoreLabel(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 64) return "Buy territory";
  if (score >= 45) return "Hold territory";
  return "Sell territory";
}

// Portfolio-level read: allocation, overlap, and how much money sits in
// names the committee would sell. Rendered above the per-holding cards.
export default function PortfolioHealthCard({ health }) {
  if (!health) return null;

  const { weightedScore, ratedValuePct, pctInSellRated, sellRatedSymbols, weights, flags } =
    health;
  const topWeights = weights.slice(0, 5);
  const warns = flags.filter((f) => f.severity === "warn");
  const infos = flags.filter((f) => f.severity !== "warn");

  return (
    <div className={styles.card}>
      <div className={styles.title}>Portfolio health</div>

      {pctInSellRated > 0 ? (
        <p className={styles.headline}>
          <span className={styles.headlineWarn}>
            {fmtPct(pctInSellRated)} of your money
          </span>{" "}
          is in name{sellRatedSymbols.length === 1 ? "" : "s"} the committee
          would sell ({sellRatedSymbols.join(", ")}).
        </p>
      ) : (
        Number.isFinite(weightedScore) && (
          <p className={styles.headline}>
            No holdings are Sell-rated right now.
          </p>
        )
      )}

      {Number.isFinite(weightedScore) && (
        <p className={styles.scoreLine}>
          Weighted by position size, your portfolio scores{" "}
          <span className={styles.scoreValue}>
            {weightedScore.toFixed(0)}/100
          </span>{" "}
          — {scoreLabel(weightedScore)?.toLowerCase()}
          {ratedValuePct < 99.5 &&
            ` (covers the ${fmtPct(ratedValuePct)} of value the committee can rate)`}
          .
        </p>
      )}

      <div className={styles.weights}>
        {topWeights.map((w) => (
          <div key={w.symbol} className={styles.weightRow}>
            <span className={styles.weightSymbol}>
              {w.symbol}
              {w.isFund && <span className={styles.fundTag}>fund</span>}
            </span>
            <div className={styles.weightTrack}>
              <div
                className={`${styles.weightFill} ${
                  w.action === "SELL"
                    ? styles.weightSell
                    : w.action === "BUY"
                      ? styles.weightBuy
                      : ""
                }`}
                style={{ width: `${Math.min(100, w.weightPct)}%` }}
              />
            </div>
            <span className={styles.weightPct}>{fmtPct(w.weightPct, 1)}</span>
          </div>
        ))}
        {weights.length > topWeights.length && (
          <p className={styles.moreNote}>
            +{weights.length - topWeights.length} smaller holding
            {weights.length - topWeights.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {(warns.length > 0 || infos.length > 0) && (
        <ul className={styles.flagList}>
          {warns.map((f, i) => (
            <li key={`w${i}`} className={`${styles.flag} ${styles.flagWarn}`}>
              {f.text}
            </li>
          ))}
          {infos.map((f, i) => (
            <li key={`i${i}`} className={styles.flag}>
              {f.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
