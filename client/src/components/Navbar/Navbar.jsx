import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import AddIcon from "@mui/icons-material/Add";
import HomeIcon from "@mui/icons-material/Home";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";

import styles from "./Navbar.module.css";

// Circular ghost header icon buttons (theme toggle, close).
const iconBtnSx = {
  width: 32,
  height: 32,
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-hover-overlay)",
    color: "var(--palette-text-primary)",
  },
};

// "Home" nav item — active state adds elevated bg + left accent bar.
const homeBtnSx = (active) => ({
  width: "100%",
  justifyContent: "flex-start",
  gap: "10px",
  padding: "10px 12px",
  borderRadius: "var(--shape-radius)",
  fontSize: 13,
  fontWeight: 500,
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
      top: 10,
      bottom: 10,
      width: 2,
      backgroundColor: "var(--palette-text-primary)",
      borderRadius: "0 2px 2px 0",
    },
  }),
});

// Full-width elevated outlined footer action buttons.
const btnOutlinedSx = {
  width: "100%",
  padding: "8px 16px",
  fontSize: 13,
  backgroundColor: "var(--palette-bg-elevated)",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-primary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    borderColor: "var(--palette-divider-strong)",
  },
  "&.Mui-disabled": { opacity: 0.5 },
};
import getMarketSession, {
  marketSessionLabel,
} from "../../utils/marketSession";
import NavItem from "./NavItem";
import SymbolSearch from "../SymbolSearch/SymbolSearch";

function formatNyTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const FIDELITY_IMPORT_TOOLTIP =
  "In Fidelity: open the Positions tab, click the ⋮ menu at the top-right of the positions table, then choose Download. Upload or paste that CSV here.";

function Navbar({
  mode,
  selectedSymbol,
  storedSymbolsWithNames,
  onCloseNav,
  onClickAddTickerModal,
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
  const refreshTooltip = tickerCount === 0 ? "No tickers to refresh" : "";

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
          <IconButton sx={iconBtnSx} onClick={onCloseNav} title="Close sidebar" aria-label="Close sidebar">
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>
      </div>

      <div className={styles.homeNav}>
        <Button
          variant="text"
          sx={homeBtnSx(!selectedSymbol)}
          onClick={onClickHome}
          aria-current={!selectedSymbol ? "page" : undefined}
          startIcon={<HomeIcon fontSize="small" />}
        >
          Home
        </Button>
      </div>

      <div className={styles.searchWrap}>
        <SymbolSearch onSelectSymbol={(symbol) => onClickSymbol(symbol)} />
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
              <NavItem
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
        <Tooltip title={refreshTooltip} disableHoverListener={!refreshTooltip}>
          <span>
            <Button
              variant="outlined"
              sx={btnOutlinedSx}
              onClick={onRefreshAllTickers}
              disabled={refreshDisabled}
              startIcon={<RefreshIcon fontSize="small" />}
            >
              {isRefreshingAll ? "Refreshing…" : "Refresh all"}
            </Button>
          </span>
        </Tooltip>

        <Tooltip title={FIDELITY_IMPORT_TOOLTIP}>
          <Button
            variant="outlined"
            sx={btnOutlinedSx}
            onClick={onClickImportPortfolioModal}
            startIcon={<UploadFileIcon fontSize="small" />}
          >
            Import Fidelity portfolio
          </Button>
        </Tooltip>

        <Tooltip title="Push your imported holdings to the daily email report">
          <Button
            variant="outlined"
            sx={btnOutlinedSx}
            onClick={onClickReportSyncModal}
            startIcon={<EmailOutlinedIcon fontSize="small" />}
          >
            Sync email report
          </Button>
        </Tooltip>

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

export default Navbar;
