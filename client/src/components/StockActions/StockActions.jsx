import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import Tooltip from "@mui/material/Tooltip";
import isMarketOpen from "../../utils/isMarketOpen";
import styles from "./StockActions.module.css";

function StockActions({
  selectedSymbol,
  isRefreshingData,
  onRefresh,
  onDelete,
}) {
  const marketOpen = isMarketOpen();

  const refreshDisabled = !selectedSymbol || marketOpen || isRefreshingData;
  const refreshTooltip = marketOpen
    ? "Disabled while the market is open"
    : !selectedSymbol
      ? "Select a ticker to refresh"
      : "";

  return (
    <div className={styles.actions}>
      <Tooltip title={refreshTooltip} disableHoverListener={!refreshTooltip}>
        <span>
          <button
            type="button"
            className={styles.btnAction}
            onClick={onRefresh}
            disabled={refreshDisabled}
          >
            <RefreshIcon fontSize="small" />
            {isRefreshingData ? "Refreshing…" : "Refresh"}
          </button>
        </span>
      </Tooltip>

      <Tooltip
        title={!selectedSymbol ? "Select a ticker to delete" : "Remove ticker"}
        disableHoverListener={false}
      >
        <span>
          <button
            type="button"
            className={`${styles.iconAction} ${styles.danger}`}
            onClick={onDelete}
            disabled={!selectedSymbol}
            aria-label="Delete ticker"
          >
            <DeleteOutlineIcon fontSize="small" />
          </button>
        </span>
      </Tooltip>
    </div>
  );
}

export default StockActions;
