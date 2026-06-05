import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Tooltip from "@mui/material/Tooltip";

import styles from "./Navbar.module.css";
import isMarketOpen from "../../utils/isMarketOpen";
import NavItem from "./NavItem";

function formatNyTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Navbar({
  mode,
  selectedSymbol,
  storedSymbolsWithNames,
  onCloseNav,
  onClickAddTickerModal,
  onClickSymbol,
  onRefreshAllTickers,
  toggleTheme,
  isRefreshingAll,
}) {
  const marketOpen = isMarketOpen();
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
        <div className={styles.logo}>stockjs</div>
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
        <button
          type="button"
          className={styles.btnOutlined}
          onClick={onClickAddTickerModal}
        >
          <AddIcon fontSize="small" />
          Add ticker
        </button>

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

        <div className={styles.footerMeta}>
          <span>
            <span
              className={`${styles.statusDot} ${marketOpen ? styles.live : styles.closed}`}
            />
            {marketOpen ? "LIVE" : "CLOSED"}
          </span>
          <span>{nyTime} ET</span>
        </div>
      </div>
    </aside>
  );
}

export default Navbar;
