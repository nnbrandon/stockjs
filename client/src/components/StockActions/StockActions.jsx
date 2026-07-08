import { useState } from "react";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import styles from "./StockActions.module.css";

const menuPaperSx = {
  backgroundColor: "var(--palette-bg-elevated)",
  border: "1px solid var(--palette-divider)",
  borderRadius: "var(--shape-radius)",
  minWidth: 190,
  boxShadow: "0 12px 32px -8px rgba(0, 0, 0, 0.5)",
  "& .MuiMenuItem-root": {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "var(--palette-text-primary)",
    gap: 0,
    "&:hover": { backgroundColor: "var(--palette-bg-hover)" },
  },
  "& .MuiListItemIcon-root": {
    minWidth: 30,
    color: "var(--palette-text-secondary)",
  },
};

// Desktop shows the actions inline; on phones they collapse behind a single ⋯
// menu to keep the compact header uncluttered. Both are always rendered and
// swapped by a CSS media query (no viewport JS).
function StockActions({
  selectedSymbol,
  isRefreshingData,
  onRefresh,
  onDelete,
  isMember = true,
  isAddingToWatchlist = false,
  onAddToWatchlist,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const refreshDisabled = !selectedSymbol || isRefreshingData;

  const close = () => setAnchorEl(null);
  const run = (fn) => () => {
    close();
    fn?.();
  };

  return (
    <div className={styles.actions}>
      {/* ── Desktop: inline buttons ── */}
      <div className={styles.inline}>
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

        {!isMember ? (
          <button
            type="button"
            className={styles.btnAddWatchlist}
            onClick={onAddToWatchlist}
            disabled={!selectedSymbol || isAddingToWatchlist}
          >
            <AddIcon fontSize="small" />
            {isAddingToWatchlist ? "Adding…" : "Add to watchlist"}
          </button>
        ) : (
          <>
            <Tooltip title="On your watchlist">
              <span
                className={styles.memberBadge}
                aria-label="On your watchlist"
              >
                <CheckIcon fontSize="small" />
              </span>
            </Tooltip>
            <Tooltip title={!selectedSymbol ? "Select a ticker" : "Remove ticker"}>
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
          </>
        )}
      </div>

      {/* ── Mobile: ⋯ menu ── */}
      <div className={styles.kebab}>
        <button
          type="button"
          className={styles.iconAction}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          disabled={!selectedSymbol}
          aria-label="Ticker actions"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreVertIcon fontSize="small" />
        </button>

        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={close}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: menuPaperSx } }}
        >
          <MenuItem onClick={run(onRefresh)} disabled={isRefreshingData}>
            <ListItemIcon>
              <RefreshIcon fontSize="small" />
            </ListItemIcon>
            {isRefreshingData ? "Refreshing…" : "Refresh"}
          </MenuItem>

          {!isMember ? (
            <MenuItem
              onClick={run(onAddToWatchlist)}
              disabled={isAddingToWatchlist}
            >
              <ListItemIcon>
                <AddIcon fontSize="small" />
              </ListItemIcon>
              {isAddingToWatchlist ? "Adding…" : "Add to watchlist"}
            </MenuItem>
          ) : (
            <MenuItem
              onClick={run(onDelete)}
              sx={{
                color: "var(--palette-error) !important",
                "& .MuiListItemIcon-root": {
                  color: "var(--palette-error) !important",
                },
              }}
            >
              <ListItemIcon>
                <DeleteOutlineIcon fontSize="small" />
              </ListItemIcon>
              Remove ticker
            </MenuItem>
          )}
        </Menu>
      </div>
    </div>
  );
}

export default StockActions;
