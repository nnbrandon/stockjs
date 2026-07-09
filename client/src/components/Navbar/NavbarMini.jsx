import { useEffect, useState } from "react";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import HomeIcon from "@mui/icons-material/Home";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";

import styles from "./NavbarMini.module.css";

// Circular ghost header icon buttons (theme toggle, expand).
const iconBtnSx = {
  width: 26,
  height: 26,
  flexShrink: 0,
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-hover-overlay)",
    color: "var(--palette-text-primary)",
  },
};

// Collapsed "Home" toggle — active adds elevated bg + left accent bar.
const homeBtnSx = (active) => ({
  width: "100%",
  height: 32,
  borderRadius: "var(--shape-radius-sm)",
  position: "relative",
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-hover-overlay)",
    color: "var(--palette-text-primary)",
  },
  ...(active && {
    backgroundColor: "var(--palette-bg-elevated)",
    color: "var(--palette-text-primary)",
    "&:hover": { backgroundColor: "var(--palette-bg-elevated)" },
    "&::before": {
      content: '""',
      position: "absolute",
      left: 0,
      top: 8,
      bottom: 8,
      width: 2,
      backgroundColor: "var(--palette-text-primary)",
      borderRadius: "0 2px 2px 0",
    },
  }),
});

// Compact bordered footer action buttons (refresh / import / sync).
const iconActionBtnSx = {
  flex: 1,
  height: 28,
  borderRadius: "var(--shape-radius-sm)",
  backgroundColor: "var(--palette-bg-elevated)",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    color: "var(--palette-text-primary)",
    borderColor: "var(--palette-divider-strong)",
  },
  "&.Mui-disabled": { opacity: 0.5 },
};
import getMarketSession, {
  marketSessionLabel,
} from "../../utils/marketSession";
import NavItemMini from "./NavItemMini";

function formatNyTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const FIDELITY_IMPORT_TOOLTIP =
  "In Fidelity: Positions tab → ⋮ menu → Download. Upload or paste that CSV here.";

function NavbarMini({
  mode,
  selectedSymbol,
  storedSymbolsWithNames,
  onExpandNav,
  onClickImportPortfolioModal,
  onClickReportSyncModal,
  onClickSymbol,
  onClickHome,
  onRefreshAllTickers,
  toggleTheme,
  isRefreshingAll,
}) {
  const session = getMarketSession();
  const [nyTime, setNyTime] = useState(formatNyTime);

  useEffect(() => {
    const id = setInterval(() => setNyTime(formatNyTime()), 30_000);
    return () => clearInterval(id);
  }, []);

  const tickerCount = storedSymbolsWithNames.length;

  const refreshDisabled = tickerCount === 0 || isRefreshingAll;
  const refreshTooltip =
    tickerCount === 0 ? "No tickers to refresh" : "Refresh all";

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.logoBtn}
          onClick={onClickHome}
          title="Back to home"
        >
          stockjs
        </button>
        <div className={styles.headerActions}>
          <IconButton
            sx={iconBtnSx}
            onClick={toggleTheme}
            title={
              mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            aria-label={
              mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {mode === "dark" ? (
              <LightModeIcon fontSize="small" />
            ) : (
              <DarkModeIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            sx={iconBtnSx}
            onClick={onExpandNav}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <KeyboardDoubleArrowRightIcon fontSize="small" />
          </IconButton>
        </div>
      </div>

      <div className={styles.homeNav}>
        <Tooltip title="Home">
          <IconButton
            sx={homeBtnSx(!selectedSymbol)}
            onClick={onClickHome}
            aria-label="Home"
            aria-current={!selectedSymbol ? "page" : undefined}
          >
            <HomeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className={styles.watchlistLabel}>
        Watchlist
        <span className={styles.chipCount}>
          {tickerCount.toString().padStart(2, "0")}
        </span>
      </div>

      <ul className={styles.tickerList} aria-label="Watchlist">
        {tickerCount === 0 && (
          <li className={styles.emptyState}>No tickers yet.</li>
        )}
        {storedSymbolsWithNames.map(({ symbol, name }) => {
          const isSelected = selectedSymbol === symbol;
          return (
            <li key={symbol}>
              <NavItemMini
                symbol={symbol}
                name={name}
                isSelected={isSelected}
                onClickSymbol={onClickSymbol}
              />
            </li>
          );
        })}
      </ul>

      <div className={styles.footer}>
        <div className={styles.actionRow}>
          <Tooltip title={refreshTooltip}>
            <span style={{ flex: 1, display: "flex" }}>
              <IconButton
                sx={iconActionBtnSx}
                onClick={onRefreshAllTickers}
                disabled={refreshDisabled}
                aria-label="Refresh all tickers"
              >
                <RefreshIcon
                  fontSize="small"
                  className={isRefreshingAll ? styles.spinning : ""}
                />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={FIDELITY_IMPORT_TOOLTIP}>
            <IconButton
              sx={iconActionBtnSx}
              onClick={onClickImportPortfolioModal}
              aria-label="Import Fidelity portfolio"
            >
              <UploadFileIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Sync email report">
            <IconButton
              sx={iconActionBtnSx}
              onClick={onClickReportSyncModal}
              aria-label="Sync email report"
            >
              <EmailOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>

        <div className={styles.footerMeta}>
          <span>
            <span
              className={`${styles.statusDot} ${session === "regular" ? styles.live : session === "closed" ? styles.closed : styles.extended}`}
            />
            {marketSessionLabel(session)}
          </span>
          <span>{nyTime} ET</span>
        </div>
      </div>
    </aside>
  );
}

export default NavbarMini;
