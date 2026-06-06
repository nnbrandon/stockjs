import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";

import useTrendingStocks from "../../hooks/useTrendingStocks";
import { addSymbolToWatchlist } from "../../utils/addSymbolToWatchlist";
import { useSnackbar } from "../SnackbarProvider";
import styles from "./TrendingStocks.module.css";

function TrendingCard({ stock, inWatchlist, isAdding, onSelect }) {
  const isUp = stock.changePercent >= 0;
  const sign = isUp ? "+" : "−";
  const hasChange = Number.isFinite(stock.changePercent);

  return (
    <button
      type="button"
      className={`${styles.card} ${inWatchlist ? styles.inWatchlist : ""}`}
      onClick={() => onSelect(stock.symbol)}
      disabled={isAdding}
      aria-label={
        inWatchlist
          ? `View ${stock.symbol}`
          : `Add ${stock.symbol} to watchlist`
      }
    >
      <div className={styles.row}>
        <span className={styles.symbol}>{stock.symbol}</span>
        <span className={styles.price}>{stock.price.toFixed(2)}</span>
      </div>
      <div className={styles.name}>{stock.name}</div>
      <div className={styles.footer}>
        {hasChange ? (
          <span
            className={`${styles.change} ${isUp ? styles.up : styles.down}`}
          >
            {sign}
            {Math.abs(stock.changePercent).toFixed(2)}%
          </span>
        ) : (
          <span />
        )}
        {isAdding ? (
          <span className={styles.spinner} aria-hidden />
        ) : inWatchlist ? (
          <span className={styles.badge}>
            <CheckIcon className={styles.checkIcon} />
            Watching
          </span>
        ) : (
          <span className={styles.addBtn} aria-hidden>
            <AddIcon sx={{ fontSize: 14 }} />
          </span>
        )}
      </div>
    </button>
  );
}

export default function TrendingStocks({
  watchlistSymbols,
  onSelectSymbol,
  onWatchlistChange,
}) {
  const showSnackbar = useSnackbar();
  const { data: stocks = [], isLoading, error, refetch } = useTrendingStocks();
  const [addingSymbol, setAddingSymbol] = useState(null);

  const handleSelect = async (symbol) => {
    if (watchlistSymbols.includes(symbol)) {
      onSelectSymbol(symbol);
      return;
    }

    setAddingSymbol(symbol);
    try {
      await addSymbolToWatchlist(symbol);
      onWatchlistChange();
      onSelectSymbol(symbol);
    } catch (err) {
      showSnackbar(`Error adding ${symbol}: ${err.message}`, "error");
    } finally {
      setAddingSymbol(null);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Trending stocks</h2>
        <p className={styles.subtitle}>
          Popular on Yahoo Finance right now. Click a ticker to add it to your
          watchlist and open the chart.
        </p>
      </div>

      {isLoading && (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className={styles.error}>
          {error.message || "Could not load trending stocks"}
          <div>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => refetch()}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!isLoading && !error && stocks.length > 0 && (
        <div className={styles.grid}>
          {stocks.map((stock) => (
            <TrendingCard
              key={stock.symbol}
              stock={stock}
              inWatchlist={watchlistSymbols.includes(stock.symbol)}
              isAdding={addingSymbol === stock.symbol}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
