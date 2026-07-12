import styles from "./ThesisCard.module.css";

// "Why you'd own it" — the thesis the committee set when it rated this a BUY,
// re-checked on every run. Each leg is a business reason captured as a number
// (margins, growth, cash…), so "the reason you bought is gone" becomes a
// checkable fact instead of a feeling. Renders nothing when no thesis exists
// (HOLD/SELL verdicts, or a chart-driven buy with no strong business legs).

const STATUS_MARKS = {
  intact: { mark: "✓", cls: "ok", label: "holding" },
  weakening: { mark: "⚠", cls: "warn", label: "weakening" },
  broken: { mark: "✗", cls: "bad", label: "broken" },
  nodata: { mark: "○", cls: "na", label: "can't check" },
};

const fmtPrice = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : null;

function fmtDay(day) {
  if (!day) return null;
  try {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return day;
  }
}

export default function ThesisCard({ thesis, thesisCheck }) {
  if (!thesis || !thesisCheck?.legs?.length) return null;

  const day = fmtDay(thesis.createdDay);
  const price = fmtPrice(thesis.price);
  const setLine = day
    ? `Thesis set ${day}${price ? ` at ${price}` : ""}`
    : null;

  return (
    <div className={styles.card} role="note">
      <div className={styles.title}>Why you&apos;d own it</div>
      {setLine && <p className={styles.setLine}>{setLine}</p>}
      <ul className={styles.legs}>
        {thesisCheck.legs.map((leg) => {
          const m = STATUS_MARKS[leg.status] ?? STATUS_MARKS.nodata;
          return (
            <li key={leg.id} className={styles.leg}>
              <span
                className={`${styles.mark} ${styles[m.cls]}`}
                aria-label={m.label}
              >
                {m.mark}
              </span>
              <span className={styles.legText}>{leg.line}</span>
            </li>
          );
        })}
      </ul>
      {thesisCheck.status === "watch" && (
        <p className={`${styles.footer} ${styles.footerWarn}`}>
          One of the reasons to own this is wobbling — worth watching.
        </p>
      )}
      {thesisCheck.status === "broken" && (
        <p className={`${styles.footer} ${styles.footerBad}`}>
          The original reasons to own this have broken down. When the why is
          gone, long-term investors usually move on — see the committee&apos;s
          current verdict above.
        </p>
      )}
    </div>
  );
}
