import { useMemo } from "react";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";

import { describeTrackRecord } from "@stockjs/committee-engine/trackRecord.js";
import styles from "./TrackRecordCard.module.css";

// The committee's REAL report card: how its actual past verdicts on your
// holdings have panned out as time passes. Distinct from the "test it" modal
// (a simulation) — this is live outcomes, updated on every run and every
// morning. Renders nothing until at least one verdict has aged ~30 days.
export default function TrackRecordCard({ trackRecord }) {
  const lines = useMemo(
    () => describeTrackRecord(trackRecord).lines,
    [trackRecord],
  );
  if (!lines.length) return null;

  const [headline, ...detail] = lines;
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <InsightsOutlinedIcon sx={{ fontSize: 16 }} />
        <span className={styles.title}>The committee&apos;s report card</span>
      </div>
      <p className={styles.intro}>
        Unlike the &ldquo;test it&rdquo; button below, this is the committee
        grading its actual past verdicts on your stocks as time passes.
      </p>
      <p className={styles.headline}>{headline}</p>
      {detail.map((line) => (
        <p key={line} className={styles.detail}>
          {line}
        </p>
      ))}
    </div>
  );
}
