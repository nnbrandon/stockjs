import styles from "./EarningsReviewCard.module.css";

// Post-earnings review — "what we expected vs. what happened", shown for
// ~10 days after each report. The RecentEarningsBanner (on the stock page)
// is the attention hook that a report just landed; this card is the
// substance: expectation vs. outcome, the market's reaction, and whether the
// committee's view changed. Renders nothing outside the review window.
export default function EarningsReviewCard({ review }) {
  if (!review?.lines?.length) return null;

  return (
    <div className={styles.card} role="note">
      <div className={styles.title}>Earnings review</div>
      {review.lines.map((line) => (
        <p key={line} className={styles.line}>
          {line}
        </p>
      ))}
    </div>
  );
}
