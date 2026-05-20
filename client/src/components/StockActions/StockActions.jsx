import { Button, Tooltip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import isMarketOpen from "../../utils/isMarketOpen";
import styles from "./StockActions.module.css";

function StockActions({
  selectedSymbol,
  isRefreshingData,
  onRefresh,
  onDelete,
}) {
  const marketOpen = isMarketOpen();

  const refreshTooltip = marketOpen
    ? "Disabled while the market is open"
    : !selectedSymbol
      ? "Select a ticker to refresh"
      : "";

  return (
    <div className={styles.actions}>
      {isRefreshingData ? (
        <Button disabled variant="outlined">
          Refreshing...
        </Button>
      ) : (
        <Tooltip
          title={refreshTooltip}
          disableHoverListener={!marketOpen && !!selectedSymbol}
        >
          <span>
            <Button
              variant="outlined"
              onClick={onRefresh}
              disabled={!selectedSymbol || marketOpen}
            >
              Refresh Data
            </Button>
          </span>
        </Tooltip>
      )}
      <Button
        variant="outlined"
        color="error"
        onClick={onDelete}
        disabled={!selectedSymbol}
        aria-label="delete"
      >
        Delete
        <DeleteIcon />
      </Button>
    </div>
  );
}

export default StockActions;
