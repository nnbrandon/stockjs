import UploadFileIcon from "@mui/icons-material/UploadFile";
import Tooltip from "@mui/material/Tooltip";

import TrendingStocks from "../TrendingStocks/TrendingStocks";
import PortfolioSummary from "../PortfolioSummary/PortfolioSummary";
import styles from "./HomeView.module.css";

const FIDELITY_IMPORT_TOOLTIP =
  "In Fidelity: open the Positions tab, click the ⋮ menu at the top-right of the positions table, then choose Download. Upload or paste that CSV here.";

export default function HomeView({
  positions,
  watchlistSymbols,
  onSelectSymbol,
  onWatchlistChange,
  onImportPortfolio,
}) {
  const hasPortfolio = positions.length > 0;

  if (hasPortfolio) {
    return (
      <>
        <TrendingStocks
          compact
          watchlistSymbols={watchlistSymbols}
          onSelectSymbol={onSelectSymbol}
          onWatchlistChange={onWatchlistChange}
        />
        <PortfolioSummary
          positions={positions}
          onSelectSymbol={onSelectSymbol}
        />
      </>
    );
  }

  return (
    <div className={styles.discovery}>
      <div className={styles.discoveryHeader}>
        <div className={styles.discoveryIntro}>
          <h2 className={styles.title}>Trending stocks</h2>
          <p className={styles.subtitle}>
            Popular on Yahoo Finance right now. Click a ticker to add it to your
            watchlist and open the chart.
          </p>
        </div>
        <Tooltip title={FIDELITY_IMPORT_TOOLTIP}>
          <button
            type="button"
            className={styles.importBtn}
            onClick={onImportPortfolio}
          >
            <UploadFileIcon fontSize="small" />
            Import Fidelity portfolio
          </button>
        </Tooltip>
      </div>

      <TrendingStocks
        hideHeader
        watchlistSymbols={watchlistSymbols}
        onSelectSymbol={onSelectSymbol}
        onWatchlistChange={onWatchlistChange}
      />
    </div>
  );
}
