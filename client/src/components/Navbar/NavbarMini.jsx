import { useEffect, useState } from "react";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Tooltip from "@mui/material/Tooltip";

import styles from "./NavbarMini.module.css";
import isMarketOpen from "../../utils/isMarketOpen";
import NavItemMini from "./NavItemMini";

function formatNyTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function NavbarMini({
  selectedSymbol,
  storedSymbolsWithNames,
  onExpandNav,
  onClickAddTickerModal,
  onClickSymbol,
  onRefreshAllTickers,
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
  const refreshTooltip =
    tickerCount === 0 ? "No tickers to refresh" : "Refresh all";

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.logo}>stockjs</div>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onExpandNav}
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <KeyboardDoubleArrowRightIcon fontSize="small" />
        </button>
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
          <Tooltip title="Add ticker">
            <button
              type="button"
              className={styles.iconActionBtn}
              onClick={onClickAddTickerModal}
              aria-label="Add ticker"
            >
              <AddIcon fontSize="small" />
            </button>
          </Tooltip>

          <Tooltip title={refreshTooltip}>
            <span style={{ flex: 1, display: "flex" }}>
              <button
                type="button"
                className={styles.iconActionBtn}
                onClick={onRefreshAllTickers}
                disabled={refreshDisabled}
                aria-label="Refresh all tickers"
              >
                <RefreshIcon
                  fontSize="small"
                  className={isRefreshingAll ? styles.spinning : ""}
                />
              </button>
            </span>
          </Tooltip>
        </div>

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

export default NavbarMini;
