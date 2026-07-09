import UploadFileIcon from "@mui/icons-material/UploadFile";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";

import TrendingStocks from "../TrendingStocks/TrendingStocks";
import PortfolioSummary from "../PortfolioSummary/PortfolioSummary";
import styles from "./HomeView.module.css";

const FIDELITY_IMPORT_TOOLTIP =
  "In Fidelity: open the Positions tab, click the ⋮ menu at the top-right of the positions table, then choose Download. Upload or paste that CSV here.";

const importBtnSx = {
  flexShrink: 0,
  backgroundColor: "var(--palette-bg-elevated)",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-primary)",
  whiteSpace: "nowrap",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    borderColor: "var(--palette-divider-strong)",
  },
};

export default function HomeView({
  positions,
  onSelectSymbol,
  onImportPortfolio,
}) {
  const hasPortfolio = positions.length > 0;

  if (hasPortfolio) {
    return (
      <>
        <TrendingStocks compact onSelectSymbol={onSelectSymbol} />
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
            Popular on Yahoo Finance right now. Tap a ticker to open its detail
            page.
          </p>
        </div>
        <Tooltip title={FIDELITY_IMPORT_TOOLTIP}>
          <Button
            variant="outlined"
            sx={importBtnSx}
            onClick={onImportPortfolio}
            startIcon={<UploadFileIcon fontSize="small" />}
          >
            Import Fidelity portfolio
          </Button>
        </Tooltip>
      </div>

      <TrendingStocks hideHeader onSelectSymbol={onSelectSymbol} />
    </div>
  );
}
