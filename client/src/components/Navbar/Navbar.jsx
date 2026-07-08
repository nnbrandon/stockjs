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

import styles from "./Navbar.module.css";
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
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleTheme}
            title={
              mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {mode === "dark" ? (
              <LightModeIcon fontSize="small" />
            ) : (
              <DarkModeIcon fontSize="small" />
            )}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onCloseNav}
            title="Close sidebar"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>
      </div>

      <div className={styles.homeNav}>
        <button
          type="button"
          className={`${styles.homeBtn} ${!selectedSymbol ? styles.homeBtnActive : ""}`}
          onClick={onClickHome}
          aria-current={!selectedSymbol ? "page" : undefined}
        >
          <HomeIcon fontSize="small" />
          Home
        </button>
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
            <button
              type="button"
              className={styles.btnOutlined}
              onClick={onRefreshAllTickers}
              disabled={refreshDisabled}
            >
              <RefreshIcon fontSize="small" />
              {isRefreshingAll ? "Refreshing…" : "Refresh all"}
            </button>
          </span>
        </Tooltip>

        <Tooltip title={FIDELITY_IMPORT_TOOLTIP}>
          <button
            type="button"
            className={styles.btnOutlined}
            onClick={onClickImportPortfolioModal}
          >
            <UploadFileIcon fontSize="small" />
            Import Fidelity portfolio
          </button>
        </Tooltip>

        <Tooltip title="Push your imported holdings to the daily email report">
          <button
            type="button"
            className={styles.btnOutlined}
            onClick={onClickReportSyncModal}
          >
            <EmailOutlinedIcon fontSize="small" />
            Sync email report
          </button>
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
