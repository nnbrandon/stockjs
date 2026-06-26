import CircularProgress from "@mui/material/CircularProgress";

import { usePortfolioCommitteeContext } from "./PortfolioCommitteeProvider";
import styles from "./CommitteeBackgroundIndicator.module.css";

// Compact floating pill shown while a portfolio review is running but the
// committee panel itself isn't on screen (i.e. the user navigated to a ticker).
// Reassures the user the deep review is still going and offers a one-click way
// back to the panel. Renders nothing unless a review is actively running.
export default function CommitteeBackgroundIndicator({ onOpen }) {
  const { status, progress, reviewMode, finbert } =
    usePortfolioCommitteeContext();

  if (status !== "running") return null;

  let detail;
  if (progress.phase === "news") {
    const { done, total } = finbert?.scoreProgress || {};
    detail =
      finbert?.status === "scoring" && total > 0
        ? `Scoring news ${done}/${total}`
        : "Reading & scoring news…";
  } else if (progress.phase === "load") {
    detail = "Loading holdings…";
  } else {
    detail = `Analyzing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`;
  }

  return (
    <button type="button" className={styles.indicator} onClick={onOpen}>
      <CircularProgress size={16} thickness={5} className={styles.spinner} />
      <span className={styles.text}>
        <span className={styles.title}>
          {reviewMode === "deep" ? "Deep review" : "Quick review"} running
        </span>
        <span className={styles.detail}>{detail}</span>
      </span>
    </button>
  );
}
