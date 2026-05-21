import { Skeleton } from "@mui/material";
import styles from "./CandlestickChart.module.css";

/**
 * Skeleton placeholder that matches the candlestick chart's Paper card
 * exactly (same border, padding, height) so there's no layout shift when
 * the real chart renders in its place.
 */
export default function ChartSkeleton() {
  return (
    <div className={styles.paper}>
      <Skeleton
        variant="rounded"
        sx={{ width: "100%", height: "60vh" }}
        animation="wave"
      />
    </div>
  );
}
